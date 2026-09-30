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

/// Repair the shell environment for GUI-launched app instances.
///
/// DWO is usually started from Finder/Dock, where the app process inherits
/// launchd's minimal GUI environment: `PATH=/usr/bin:/bin:/usr/sbin:/sbin`
/// with no user-local directories (`~/.local/bin`, `~/.cargo/bin`, Homebrew)
/// and possibly no `LANG` or `HOME`. A CLI like `claude` then can't be
/// resolved until (or unless) the shell's rc files extend PATH.
///
/// portable-pty's `CommandBuilder` inherits the app's full environment, so
/// we only override the variables that need repair — user-set values are
/// always preserved. Unix only; the Windows PowerShell path is untouched.
#[cfg(unix)]
fn repair_shell_env(builder: &mut CommandBuilder) {
    let home = dirs::home_dir()
        .map(|p| p.to_string_lossy().into_owned())
        .unwrap_or_default();
    if home.is_empty() {
        return;
    }

    // HOME — required for rc files, cargo, nvm, etc.
    // Always set it so GUI-launched instances (which may inherit a wrong HOME
    // from launchd) get the correct user home directory.
    builder.env("HOME", home.as_str());

    // USER / LOGNAME — derive from the home directory's last component
    // (/Users/<name>, /home/<name>) and always set them.
    // This prevents issues like brew seeing a truncated or wrong username.
    if let Some(name) = home.rsplit('/').next() {
        builder.env("USER", name);
        builder.env("LOGNAME", name);
    }

    // PATH — keep everything the user already has, prepend the common
    // user-local / Homebrew / system directories that are missing.
    let inherited = std::env::var("PATH").unwrap_or_default();
    let mut kept: Vec<String> = Vec::new();
    for dir in inherited.split(':') {
        if !dir.is_empty() && !kept.iter().any(|p| p == dir) {
            kept.push(dir.to_string());
        }
    }
    let preferred = [
        format!("{}/.local/bin", home),
        format!("{}/.cargo/bin", home),
        "/opt/homebrew/bin".to_string(),
        "/opt/homebrew/sbin".to_string(),
        "/usr/local/bin".to_string(),
        "/usr/local/sbin".to_string(),
        "/usr/bin".to_string(),
        "/bin".to_string(),
        "/usr/sbin".to_string(),
        "/sbin".to_string(),
    ];
    let mut merged: Vec<String> = Vec::new();
    for dir in &preferred {
        if !kept.iter().any(|p| p == dir) && !merged.iter().any(|p| p == dir) {
            merged.push(dir.clone());
        }
    }
    merged.extend(kept);
    builder.env("PATH", merged.join(":").as_str());

    // LANG — a usable locale for prompts and multibyte output; never
    // override a user-set LANG or LC_ALL.
    let has_locale = ["LANG", "LC_ALL"]
        .iter()
        .any(|var| std::env::var(var).map(|v| !v.is_empty()).unwrap_or(false));
    if !has_locale {
        builder.env("LANG", "en_US.UTF-8");
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
        // Always resolve cwd to an explicit path — never fall back to "/".
        // Using the user's real home dir ensures shell rc files (brew, nvm, etc.)
        // run in a directory they can read and write.
        let cwd: std::path::PathBuf = match cwd {
            Some(p) => p.to_path_buf(),
            None => std::env::home_dir().unwrap_or_else(|| std::path::PathBuf::from("/")),
        };
        let cwd_ref = cwd.as_path();

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
        cmd_builder.cwd(cwd_ref);
        // Set terminal environment for proper TUI rendering
        cmd_builder.env("TERM", "xterm-256color");
        cmd_builder.env("COLORTERM", "truecolor");
        cmd_builder.env("DWO", "1");
        // Repair the inherited environment for GUI-launched instances
        // (launchd gives apps a minimal PATH/HOME/LANG — see fn above)
        #[cfg(unix)]
        repair_shell_env(&mut cmd_builder);

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
            &cwd,
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
