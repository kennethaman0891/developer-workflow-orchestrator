//! PTY Management
//!
//! Wraps portable-pty to provide a clean interface for spawning and
//! managing pseudo-terminal sessions. Includes panic protection via
//! catch_unwind to prevent non-unwinding panics from crashing the app.

use super::session::TerminalSession;
use std::path::Path;
use std::panic::{catch_unwind, AssertUnwindSafe};
use portable_pty::{CommandBuilder, PtySize, native_pty_system};
use tokio::sync::mpsc;

/// Spawn a new PTY session and return the session paired with the output
/// receiver. The caller MUST keep the receiver (or forward it to the
/// frontend); the PTY writes into this channel.
/// Uses catch_unwind to protect against FFI panics in portable_pty.
pub fn spawn_session(
    cmd: &str,
    cwd: Option<&Path>,
    columns: u16,
    rows: u16,
) -> Result<(TerminalSession, mpsc::UnboundedReceiver<Vec<u8>>), String> {
    // Wrap all portable_pty FFI calls in catch_unwind to prevent
    // non-unwinding panics from crashing the app
    let result = catch_unwind(AssertUnwindSafe(|| {
        let cwd = cwd.unwrap_or(Path::new("/"));

        // Create terminal dimensions
        let size = PtySize {
            rows,
            cols: columns,
            pixel_width: 0,
            pixel_height: 0,
        };

        // Create the PTY master/slave pair
        let pty_system = native_pty_system();
        let pair = pty_system.openpty(size)
            .map_err(|e| format!("Failed to create PTY: {}", e))?;

        // Spawn the child process
        let mut cmd_builder = CommandBuilder::new(cmd);
        if cwd != Path::new("/") {
            cmd_builder.cwd(cwd);
        }
        let child = pair.slave.spawn_command(cmd_builder)
            .map_err(|e| format!("Failed to spawn command: {}", e))?;

        // Drop the slave side after spawning
        drop(pair.slave);

        let session_id = uuid::Uuid::new_v4().to_string();
        let meta = super::session::SessionMeta::new(
            &session_id,
            cmd,
            &cwd.to_path_buf(),
            columns,
            rows,
        );

        // Create session and set PTY master; return the receiver so output
        // actually reaches the frontend instead of being dropped.
        // Clone the PTY output reader BEFORE moving the master into the
        // session (portable-pty requires the reader to be cloned while both
        // handles exist).
        let pty_reader = pair
            .master
            .try_clone_reader()
            .map_err(|e| format!("Failed to clone PTY reader: {}", e))?;

        // Take the PTY writer BEFORE moving the master into the session.
        // portable-pty only permits take_writer() once per PTY, so this must
        // happen exactly here; the session then keeps the writer for the
        // lifetime of the terminal (all key input flows through it).
        let pty_writer = pair
            .master
            .take_writer()
            .map_err(|e| format!("Failed to take PTY writer: {}", e))?;

        let (mut session, rx) = TerminalSession::new(meta);
        session.set_pty(pair.master);
        session.set_writer(pty_writer);
        session.set_child(child);

        // PTY reader thread: pump every chunk from the master's output
        // stream into the session's channel (which the manager's async task
        // forwards to the frontend as `terminal-output` events).
        let output_tx = session.output_tx.clone();
        std::thread::Builder::new()
            .name(format!("dwo-pty-reader-{}", session.meta.id))
            .spawn(move || {
                use std::io::Read;
                let mut reader = pty_reader;
                let mut buf = [0u8; 8192];
                loop {
                    match reader.read(&mut buf) {
                        Ok(0) => break, // EOF — child exited
                        Ok(n) => {
                            if output_tx.send(buf[..n].to_vec()).is_err() {
                                break; // receiver dropped — session closed
                            }
                        }
                        Err(e) => {
                            log::warn!("PTY reader error: {}", e);
                            break;
                        }
                    }
                }
            })
            .map_err(|e| format!("Failed to spawn PTY reader thread: {}", e))?;

        Ok((session, rx))
    }));

    // Handle any panics from portable_pty FFI calls
    match result {
        Ok(Ok(session)) => Ok(session),
        Ok(Err(e)) => Err(e),
        Err(e) => {
            let msg = if let Some(s) = e.downcast_ref::<&str>() {
                s.to_string()
            } else if let Some(s) = e.downcast_ref::<String>() {
                s.clone()
            } else {
                "unknown panic in PTY initialization".to_string()
            };
            Err(format!("PTY operation panicked: {}", msg))
        }
    }
}
