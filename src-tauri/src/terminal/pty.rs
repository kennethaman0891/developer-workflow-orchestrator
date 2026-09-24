//! PTY Management
//!
//! Wraps portable-pty to provide a clean interface for spawning and
//! managing pseudo-terminal sessions.
//!
//! Spawn logic:
//! 1. Detect the user's real login shell from `$SHELL`, fallback to /bin/zsh
//! 2. Pass `-l` (login) flag so the shell loads profile/rc files
//! 3. Set TERM=xterm-256color, COLORTERM=truecolor for proper TUI rendering
//! 4. Wrap all FFI calls in catch_unwind to prevent non-unwinding panics

use super::session::TerminalSession;
use std::path::Path;
use std::panic::{catch_unwind, AssertUnwindSafe};
use portable_pty::{CommandBuilder, PtySize, native_pty_system};
use tokio::sync::mpsc;

/// Detect the user's default login shell.
///
/// Priority: $SHELL env var → platform default (/bin/zsh on macOS, /bin/bash elsewhere)
fn detect_login_shell() -> String {
    if let Ok(shell) = std::env::var("SHELL") {
        if !shell.is_empty() {
            return shell;
        }
    }
    // Platform fallback
    if cfg!(target_os = "macos") {
        "/bin/zsh".to_string()
    } else {
        "/bin/bash".to_string()
    }
}

/// Spawn a new PTY session with the user's real login shell.
///
/// Returns the session paired with the output receiver. The caller MUST
/// keep the receiver (or forward it to the frontend).
pub fn spawn_shell(
    cwd: Option<&Path>,
    columns: u16,
    rows: u16,
) -> Result<(TerminalSession, mpsc::UnboundedReceiver<Vec<u8>>), String> {
    let result = catch_unwind(AssertUnwindSafe(|| {
        let cwd = cwd.unwrap_or(Path::new("/"));

        // Create terminal dimensions
        let size = PtySize {
            rows,
            cols: columns,
            pixel_width: 0,
            pixel_height: 0,
        };

        // Detect the real login shell
        let shell = detect_login_shell();

        // Create the PTY master/slave pair
        let pty_system = native_pty_system();
        let pair = pty_system
            .openpty(size)
            .map_err(|e| format!("Failed to create PTY: {}", e))?;

        // Build the command: login shell with proper env
        let mut cmd_builder = CommandBuilder::new(&shell);
        // Add login flag — macOS/Linux shells use -l, Windows PowerShell uses -NoLogo
        if cfg!(target_os = "windows") {
            cmd_builder.arg("-NoLogo");
        } else {
            cmd_builder.arg("-l");
        }
        if cwd != Path::new("/") {
            cmd_builder.cwd(cwd);
        }
        // Set terminal environment for proper TUI rendering
        cmd_builder.env("TERM", "xterm-256color");
        cmd_builder.env("COLORTERM", "truecolor");
        cmd_builder.env("DWO", "1");

        let child = pair
            .slave
            .spawn_command(cmd_builder)
            .map_err(|e| format!("Failed to spawn command: {}", e))?;

        // Drop the slave side after spawning
        drop(pair.slave);

        let session_id = uuid::Uuid::new_v4().to_string();
        let meta = super::session::SessionMeta::new(
            &session_id,
            &shell,
            &cwd.to_path_buf(),
            columns,
            rows,
        );

        let mut session = TerminalSession::new_with_meta(meta);

        // Clone the PTY reader BEFORE moving the master into the session
        let pty_reader = pair
            .master
            .try_clone_reader()
            .map_err(|e| format!("Failed to clone PTY reader: {}", e))?;

        // Take the PTY writer (only once per PTY — portable-pty requirement)
        let pty_writer = pair
            .master
            .take_writer()
            .map_err(|e| format!("Failed to take PTY writer: {}", e))?;

        session.set_pty(pair.master);
        session.set_writer(pty_writer);
        session.set_child(child);

        // PTY reader thread: pump every chunk from the master's output
        // into the session's channel
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

        Ok(session)
    }));

    match result {
        Ok(Ok(mut session)) => {
            let rx = session.output_rx.take().unwrap();
            Ok((session, rx))
        }
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
