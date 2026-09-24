//! Terminal Manager
//!
//! Global singleton managing all terminal sessions. Thread-safe with
//! interior mutability via parking_lot.

use std::collections::HashMap;
use std::path::Path;
use std::sync::Arc;
use parking_lot::RwLock;
use tauri::{AppHandle, Emitter};

use super::session::{SessionMeta, TerminalSession};
use super::pty::spawn_shell;

/// Check if a path exists and is a directory
pub fn path_exists(path: &Path) -> bool {
    path.exists() && path.is_dir()
}

/// Get the user's home directory, or "/" as ultimate fallback
fn home_dir() -> std::path::PathBuf {
    dirs::home_dir().unwrap_or_else(|| std::path::PathBuf::from("/"))
}

/// Validate a cwd path. Returns the validated path, or falls back to HOME.
pub fn validate_cwd(cwd: Option<&str>) -> std::path::PathBuf {
    match cwd {
        Some(path) if !path.is_empty() => {
            let p = std::path::PathBuf::from(path);
            if path_exists(&p) {
                p
            } else {
                log::warn!("cwd '{}' does not exist or is not a directory, falling back to HOME", path);
                home_dir()
            }
        }
        _ => home_dir(),
    }
}

/// Manager for all terminal sessions
pub struct TerminalManager {
    /// All active sessions
    sessions: RwLock<HashMap<String, Arc<RwLock<TerminalSession>>>>,
    /// App handle for emitting terminal output events to the frontend
    app: AppHandle,
}

impl TerminalManager {
    /// Create a new terminal manager
    pub fn new(app: AppHandle) -> Self {
        Self {
            sessions: RwLock::new(HashMap::new()),
            app,
        }
    }

    /// Create a new terminal session with PTY (login shell, cwd-validated)
    ///
    /// `workspace_id` is optional — if provided, the session is tagged
    /// for later association via WorkspaceIndex.
    pub fn create(
        &self,
        cwd: Option<&str>,
        workspace_id: Option<&str>,
        columns: u16,
        rows: u16,
    ) -> Result<String, String> {
        let validated_cwd = validate_cwd(cwd);
        log::info!("[DWO] terminal_create cwd={:?} workspace_id={:?} validated={}", cwd, workspace_id, validated_cwd.display());
        let id = uuid::Uuid::new_v4().to_string();

        // Spawn the PTY session (login shell + validated cwd)
        let (mut session, mut output_rx) = spawn_shell(Some(&validated_cwd), columns, rows)?;

        // Assign the id and workspace binding
        session.meta.id = id.clone();
        if let Some(ws_id) = workspace_id {
            session.meta.workspace_id = Some(ws_id.to_string());
        }

        let session = Arc::new(RwLock::new(session));

        // Reader task: drain the PTY output channel and forward every chunk
        // to the frontend as a `terminal-output` event, tagged by session id.
        let app = self.app.clone();
        let reader_session = Arc::clone(&session);
        let reader_id = id.clone();
        tauri::async_runtime::spawn(async move {
            while let Some(chunk) = output_rx.recv().await {
                reader_session.read().process_output_for_scrollback(&chunk);
                let payload = serde_json::json!({
                    "session_id": reader_id,
                    "data": String::from_utf8_lossy(&chunk).to_string(),
                });
                if let Err(e) = app.emit("terminal-output", payload) {
                    log::warn!("failed to emit terminal-output: {}", e);
                }
            }
        });

        let mut sessions = self.sessions.write();
        sessions.insert(id.clone(), session);

        Ok(id)
    }

    /// Get a session by ID (returns clone of metadata)
    pub fn get_meta(&self, id: &str) -> Option<SessionMeta> {
        let sessions = self.sessions.read();
        sessions.get(id).map(|s| s.read().meta.clone())
    }

    /// Attach to a session (start receiving output)
    pub fn attach(&self, id: &str) -> Result<(), String> {
        let sessions = self.sessions.read();
        if !sessions.contains_key(id) {
            return Err(format!("Session not found: {}", id));
        }
        Ok(())
    }

    /// Detach from a session
    pub fn detach(&self, id: &str) -> Result<(), String> {
        let sessions = self.sessions.read();
        if !sessions.contains_key(id) {
            return Err(format!("Session not found: {}", id));
        }
        Ok(())
    }

    /// Write data to a session
    pub fn write(&self, id: &str, data: &[u8]) -> Result<(), String> {
        let sessions = self.sessions.read();
        match sessions.get(id) {
            Some(session) => session.read().write_input(data),
            None => Err(format!("Session not found: {}", id)),
        }
    }

    /// Send a command string + newline to a session's PTY stdin
    pub fn send_command(&self, id: &str, command: &str) -> Result<(), String> {
        let sessions = self.sessions.read();
        match sessions.get(id) {
            Some(session) => session.read().send_command(command),
            None => Err(format!("Session not found: {}", id)),
        }
    }

    /// Resize a session
    pub fn resize(&self, id: &str, cols: u16, rows: u16) -> Result<(), String> {
        let mut sessions = self.sessions.write();
        match sessions.get_mut(id) {
            Some(session) => {
                let mut s = session.write();
                s.resize(cols, rows)
            }
            None => Err(format!("Session not found: {}", id)),
        }
    }

    /// Close a session
    pub fn close(&self, id: &str) -> Result<(), String> {
        let mut sessions = self.sessions.write();
        if let Some(session) = sessions.get(id) {
            let mut s = session.write();
            s.close_safely();
        }
        sessions.remove(id);
        Ok(())
    }

    /// List all sessions
    pub fn list(&self) -> Vec<SessionMeta> {
        let sessions = self.sessions.read();
        sessions.values().map(|s| s.read().meta.clone()).collect()
    }

    /// Get scrollback for a session
    pub fn get_scrollback(&self, id: &str) -> Result<Vec<String>, String> {
        let sessions = self.sessions.read();
        match sessions.get(id) {
            Some(session) => Ok(session.read().get_scrollback()),
            None => Err(format!("Session not found: {}", id)),
        }
    }

    /// Set the title of a session
    pub fn set_title(&self, id: &str, title: &str) -> Result<(), String> {
        let mut sessions = self.sessions.write();
        match sessions.get_mut(id) {
            Some(session) => {
                let mut s = session.write();
                s.meta.title = title.to_string();
                Ok(())
            }
            None => Err(format!("Session not found: {}", id)),
        }
    }

    /// Set TUI mode
    pub fn set_tui(&self, id: &str, is_tui: bool) -> Result<(), String> {
        let mut sessions = self.sessions.write();
        match sessions.get_mut(id) {
            Some(session) => {
                let mut s = session.write();
                s.meta.is_tui = is_tui;
                Ok(())
            }
            None => Err(format!("Session not found: {}", id)),
        }
    }

    /// Set focus
    pub fn set_focus(&self, id: &str, focused: bool) -> Result<(), String> {
        let mut sessions = self.sessions.write();
        match sessions.get_mut(id) {
            Some(session) => {
                let mut s = session.write();
                s.meta.focus = focused;
                s.meta.touch();
                Ok(())
            }
            None => Err(format!("Session not found: {}", id)),
        }
    }

    /// Set visibility
    pub fn set_visible(&self, id: &str, visible: bool) -> Result<(), String> {
        let mut sessions = self.sessions.write();
        match sessions.get_mut(id) {
            Some(session) => {
                let mut s = session.write();
                s.meta.visible = visible;
                Ok(())
            }
            None => Err(format!("Session not found: {}", id)),
        }
    }

    /// Handle dropped files
    pub fn drop_files(&self, id: &str, files: &[String]) -> Result<(), String> {
        let sessions = self.sessions.read();
        if !sessions.contains_key(id) {
            return Err(format!("Session not found: {}", id));
        }
        for file in files {
            let escaped = file.replace(' ', "\\ ").replace('"', "\\\"");
            if let Some(session) = sessions.get(id) {
                let input = format!("{}\x0d", escaped);
                let _ = session.read().write_input(input.as_bytes());
            }
        }
        Ok(())
    }
}
