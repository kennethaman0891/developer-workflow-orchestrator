//! Resize Handler
//!
//! Handles terminal resize events and propagates them to PTY sessions.

use super::manager::TerminalManager;
use tauri::State;

/// Resize a terminal session
pub fn resize(
    manager: State<TerminalManager>,
    id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    manager.resize(&id, cols, rows)
}
