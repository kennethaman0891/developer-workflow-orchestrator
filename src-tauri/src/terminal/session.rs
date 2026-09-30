//! Session Management
//!
//! Defines the SessionMeta struct and TerminalSession type that wraps
//! a PTY session with metadata and output handling.

use std::path::PathBuf;
use std::sync::Arc;
use parking_lot::Mutex;
use tokio::sync::mpsc;
use chrono::{DateTime, Utc};

/// Maximum number of completed lines retained in the scrollback buffer.
const SCROLLBACK_CAP: usize = 1000;
/// Maximum bytes a single incomplete line may accumulate in the pending buffer
/// before being force-flushed (runaway single-line stream).
const PENDING_CAP: usize = 64 * 1024;

/// Metadata about a terminal session
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct SessionMeta {
    /// Unique session identifier
    pub id: String,
    /// User-visible title (typically the shell path)
    pub title: String,
    /// Working directory
    pub cwd: PathBuf,
    /// Terminal columns
    pub columns: u16,
    /// Terminal rows
    pub rows: u16,
    /// Creation timestamp
    pub created_at: DateTime<Utc>,
    /// Last activity timestamp
    pub last_activity: DateTime<Utc>,
    /// Whether this session has focus
    pub focus: bool,
    /// Whether this session is visible
    pub visible: bool,
    /// Whether this is a TUI application
    pub is_tui: bool,
    /// Workspace this session belongs to (set after creation)
    #[serde(default)]
    pub workspace_id: Option<String>,
}

impl SessionMeta {
    /// Create a new session metadata with default values
    pub fn new(id: &str, title: &str, cwd: &PathBuf, columns: u16, rows: u16) -> Self {
        let now = Utc::now();
        Self {
            id: id.to_string(),
            title: title.to_string(),
            cwd: cwd.clone(),
            columns,
            rows,
            created_at: now,
            last_activity: now,
            focus: false,
            visible: true,
            is_tui: false,
            workspace_id: None,
        }
    }

    /// Update the last activity timestamp
    pub fn touch(&mut self) {
        self.last_activity = Utc::now();
    }
}

/// A terminal session wrapping a PTY with output channels
pub struct TerminalSession {
    /// Session metadata
    pub meta: SessionMeta,
    /// Output sender for streaming to frontend
    pub output_tx: mpsc::UnboundedSender<Vec<u8>>,
    /// Output receiver — taken once during initialization by spawn_shell
    pub output_rx: Option<mpsc::UnboundedReceiver<Vec<u8>>>,
    /// Scrollback buffer (last N lines)
    pub scrollback: Arc<Mutex<Vec<String>>>,
    /// Carry-over buffer for a logical line that has not yet received its
    /// trailing `\n` (chunk boundaries must not split multi-byte UTF-8 or
    /// ANSI escape sequences).
    pub scrollback_pending: Mutex<Vec<u8>>,
    /// Optional PTY master handle (kept for resize operations)
    pub pty_master: Option<Arc<Mutex<Box<dyn portable_pty::MasterPty + Send>>>>,
    /// Persistent PTY writer.
    ///
    /// portable-pty only allows `MasterPty::take_writer()` to be called ONCE
    /// per PTY — subsequent calls fail with "cannot take writer more than
    /// once". We therefore take the writer at spawn time and hold it here for
    /// the lifetime of the session, serialising writes through a Mutex.
    pub pty_writer: Option<Arc<Mutex<Box<dyn std::io::Write + Send>>>>,
    /// Child process handle - must be kept alive to keep shell running
    #[allow(dead_code)]
    pub child: Option<Box<dyn portable_pty::Child + Send + Sync>>,
}

impl TerminalSession {
    /// Create a new terminal session (legacy — unused, prefer new_with_meta)
    #[allow(dead_code)]
    pub fn new(_meta: SessionMeta) -> (Self, mpsc::UnboundedReceiver<Vec<u8>>) {
        panic!("Legacy TerminalSession::new is deprecated — use new_with_meta + spawn_shell")
    }

    /// Create a new terminal session with output_rx available for spawn_shell
    pub fn new_with_meta(meta: SessionMeta) -> Self {
        let (output_tx, output_rx) = mpsc::unbounded_channel();
        Self {
            meta,
            output_tx,
            output_rx: Some(output_rx),
            scrollback: Arc::new(Mutex::new(Vec::new())),
            scrollback_pending: Mutex::new(Vec::new()),
            pty_master: None,
            pty_writer: None,
            child: None,
        }
    }

    /// Set the PTY master handle
    pub fn set_pty(&mut self, master: Box<dyn portable_pty::MasterPty + Send>) {
        self.pty_master = Some(Arc::new(Mutex::new(master)));
    }

    /// Set the persistent PTY writer. Must be called exactly once, from the
    /// writer returned by `MasterPty::take_writer()` at spawn time.
    pub fn set_writer(&mut self, writer: Box<dyn std::io::Write + Send>) {
        self.pty_writer = Some(Arc::new(Mutex::new(writer)));
    }

    /// Set the child process handle
    pub fn set_child(&mut self, child: Box<dyn portable_pty::Child + Send + Sync>) {
        self.child = Some(child);
    }

    /// Send output data to the frontend
    pub fn send_output(&self, data: Vec<u8>) -> Result<(), String> {
        self.output_tx.send(data).map_err(|e| e.to_string())
    }

    /// Get the scrollback buffer
    pub fn get_scrollback(&self) -> Vec<String> {
        self.scrollback.lock().clone()
    }

    /// Append raw PTY output to the scrollback buffer.
    ///
    /// Byte-level carry-over: a logical line split across chunk boundaries is
    /// buffered in `scrollback_pending` until its `\n` arrives, so multi-byte
    /// UTF-8 and ANSI escape sequences are never cut in half. Completed lines
    /// are sanitized (ANSI escapes + C0 controls stripped, tabs kept) before
    /// storage so replays and handoff heredocs are clean text.
    pub fn process_output_for_scrollback(&self, data: &[u8]) {
        let mut pending = self.scrollback_pending.lock();
        pending.extend_from_slice(data);

        // Drain everything up to and including the last newline.
        let drain_len = match pending.iter().rposition(|&b| b == b'\n') {
            Some(i) => i + 1,
            None => {
                if pending.len() <= PENDING_CAP {
                    // Line still incomplete — carry over to the next chunk.
                    return;
                }
                // Runaway single-line stream: flush what we have
                // (one escaped char may mangle to U+FFFD — acceptable).
                pending.len()
            }
        };
        let complete: Vec<u8> = pending.drain(..drain_len).collect();

        let text = String::from_utf8_lossy(&complete);
        let mut sb = self.scrollback.lock();
        for line in text.lines() {
            sb.push(sanitize_line(line));
            while sb.len() > SCROLLBACK_CAP {
                sb.remove(0);
            }
        }
    }

    /// Write data to the PTY.
    ///
    /// Uses the persistent writer taken once at spawn time. Never calls
    /// `MasterPty::take_writer()` again — portable-pty forbids taking the
    /// writer more than once per PTY.
    pub fn write_input(&self, data: &[u8]) -> Result<(), String> {
        let writer = self
            .pty_writer
            .as_ref()
            .ok_or_else(|| "No PTY writer for this session".to_string())?;
        let mut writer = writer.lock();
        writer.write_all(data).map_err(|e| e.to_string())?;
        writer.flush().map_err(|e| e.to_string())?;
        Ok(())
    }

    /// Send a command string + newline to the PTY stdin.
    /// This is the high-level API used by terminal_send_command.
    pub fn send_command(&self, command: &str) -> Result<(), String> {
        let payload = format!("{}\r", command);
        self.write_input(payload.as_bytes())
    }

    /// Resize the PTY
    pub fn resize(&mut self, cols: u16, rows: u16) -> Result<(), String> {
        self.meta.columns = cols;
        self.meta.rows = rows;
        if let Some(master) = &self.pty_master {
            let master = master.lock();
            let _ = master.resize(portable_pty::PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            });
        }
        Ok(())
    }

    /// Safely close the session by taking handles to prevent drop-order panics.
    /// This should be called before removing the session from the manager.
    pub fn close_safely(&mut self) {
        self.child.take();
        self.pty_master.take();
        self.pty_writer.take();
    }
}

/// Strip ANSI escape sequences and all C0/DEL control characters from one
/// captured line, keeping tabs and all non-ASCII text. The result is what
/// gets stored in scrollback and replayed into fresh terminals or injected
/// via handoff heredocs.
fn sanitize_line(raw: &str) -> String {
    let no_ansi = strip_ansi::strip_ansi(raw);
    no_ansi
        .chars()
        .filter(|&c| c == '\t' || (c >= ' ' && c <= '~') || (c as u32) > 0x7F)
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn session() -> TerminalSession {
        let meta = SessionMeta::new("s", "test", &PathBuf::from("/"), 80, 24);
        TerminalSession::new_with_meta(meta)
    }

    #[test]
    fn chunk_boundary_does_not_split_line() {
        let s = session();
        s.process_output_for_scrollback(b"ab");
        assert_eq!(s.get_scrollback(), Vec::<String>::new());
        s.process_output_for_scrollback(b"c\r\n");
        assert_eq!(s.get_scrollback(), vec!["abc".to_string()]);
    }

    #[test]
    fn crlf_stripped() {
        let s = session();
        s.process_output_for_scrollback(b"hello\r\n");
        assert_eq!(s.get_scrollback(), vec!["hello".to_string()]);
    }

    #[test]
    fn ansi_color_stripped() {
        let s = session();
        s.process_output_for_scrollback(b"\x1b[31merr\x1b[0m\n");
        assert_eq!(s.get_scrollback(), vec!["err".to_string()]);
    }

    #[test]
    fn alt_screen_block_reduces_to_text() {
        let s = session();
        s.process_output_for_scrollback(b"\x1b[?1049h\x1b[2J\x1b[Hframe\x1b[?1049l\n");
        assert_eq!(s.get_scrollback(), vec!["frame".to_string()]);
    }

    #[test]
    fn escape_split_across_chunks_is_rejoined() {
        let s = session();
        s.process_output_for_scrollback(b"\x1b[?2");
        s.process_output_for_scrollback(b"5h\n");
        assert_eq!(s.get_scrollback(), vec!["".to_string()]);
    }

    #[test]
    fn utf8_split_across_chunks_survives() {
        let s = session();
        s.process_output_for_scrollback(&[0xC3]);
        s.process_output_for_scrollback(b"\xA9\n");
        assert_eq!(s.get_scrollback(), vec!["\u{e9}".to_string()]);
    }

    #[test]
    fn tab_kept_controls_dropped() {
        let s = session();
        s.process_output_for_scrollback(b"a\tb\x07c\n");
        assert_eq!(s.get_scrollback(), vec!["a\tbc".to_string()]);
    }

    #[test]
    fn scrollback_is_capped() {
        let s = session();
        let mut chunk = Vec::new();
        for i in 0..1002 {
            chunk.extend_from_slice(format!("l{i}\n").as_bytes());
        }
        s.process_output_for_scrollback(&chunk);
        let sb = s.get_scrollback();
        assert_eq!(sb.len(), SCROLLBACK_CAP);
        assert_eq!(sb.first().unwrap(), "l2");
    }

    #[test]
    fn pending_cap_forces_flush() {
        let s = session();
        let big = vec![b'x'; PENDING_CAP + 1];
        s.process_output_for_scrollback(&big);
        let sb = s.get_scrollback();
        assert_eq!(sb.len(), 1);
        assert_eq!(sb[0].len(), PENDING_CAP + 1);
        // Buffer is drained; next small line is captured normally.
        s.process_output_for_scrollback(b"next\n");
        assert_eq!(s.get_scrollback(), vec![sb[0].clone(), "next".to_string()]);
    }
}
