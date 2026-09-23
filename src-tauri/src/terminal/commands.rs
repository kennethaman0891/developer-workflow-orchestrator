//! Terminal Commands
//!
//! Tauri command handlers for terminal operations.

use std::path::PathBuf;
use super::manager::TerminalManager;

/// Create a new terminal session
#[tauri::command]
pub async fn terminal_create(
    state: tauri::State<'_, TerminalManager>,
    cmd: String,
    cwd: Option<String>,
    columns: Option<u16>,
    rows: Option<u16>,
) -> Result<String, String> {
    let cwd_path = cwd.map(PathBuf::from).unwrap_or_else(|| {
        std::env::current_dir().unwrap_or_else(|_| PathBuf::from("/"))
    });

    let cols = columns.unwrap_or(80);
    let rows = rows.unwrap_or(24);

    state.create(&cmd, &cwd_path, cols, rows)
}

/// Attach to a terminal session (start receiving output)
#[tauri::command]
pub async fn terminal_attach(
    state: tauri::State<'_, TerminalManager>,
    id: String,
) -> Result<(), String> {
    state.attach(&id)
}

/// Detach from a terminal session
#[tauri::command]
pub async fn terminal_detach(
    state: tauri::State<'_, TerminalManager>,
    id: String,
) -> Result<(), String> {
    state.detach(&id)
}

/// Write data to a terminal session
#[tauri::command]
pub async fn terminal_write(
    state: tauri::State<'_, TerminalManager>,
    id: String,
    data: String,
) -> Result<(), String> {
    state.write(&id, data.as_bytes())
}

/// Resize a terminal session
#[tauri::command]
pub async fn terminal_resize(
    state: tauri::State<'_, TerminalManager>,
    id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    state.resize(&id, cols, rows)
}

/// Close a terminal session
#[tauri::command]
pub async fn terminal_close(
    state: tauri::State<'_, TerminalManager>,
    id: String,
) -> Result<(), String> {
    state.close(&id)
}

/// List all terminal sessions
#[tauri::command]
pub async fn terminal_list(
    state: tauri::State<'_, TerminalManager>,
) -> Result<Vec<super::session::SessionMeta>, String> {
    Ok(state.list())
}

/// Get scrollback for a terminal session
#[tauri::command]
pub async fn terminal_get_scrollback(
    state: tauri::State<'_, TerminalManager>,
    id: String,
) -> Result<Vec<String>, String> {
    state.get_scrollback(&id)
}

/// Set the title of a terminal session
#[tauri::command]
pub async fn terminal_set_title(
    state: tauri::State<'_, TerminalManager>,
    id: String,
    title: String,
) -> Result<(), String> {
    state.set_title(&id, &title)
}

/// Set whether a session is in TUI mode
#[tauri::command]
pub async fn terminal_set_tui(
    state: tauri::State<'_, TerminalManager>,
    id: String,
    is_tui: bool,
) -> Result<(), String> {
    state.set_tui(&id, is_tui)
}

/// Set focus on a terminal session
#[tauri::command]
pub async fn terminal_set_focus(
    state: tauri::State<'_, TerminalManager>,
    id: String,
    focused: bool,
) -> Result<(), String> {
    state.set_focus(&id, focused)
}

/// Set visibility of a terminal session
#[tauri::command]
pub async fn terminal_set_visible(
    state: tauri::State<'_, TerminalManager>,
    id: String,
    visible: bool,
) -> Result<(), String> {
    state.set_visible(&id, visible)
}

/// Handle dropped files in a terminal session
#[tauri::command]
pub async fn terminal_drop_files(
    state: tauri::State<'_, TerminalManager>,
    id: String,
    files: Vec<String>,
) -> Result<(), String> {
    state.drop_files(&id, &files)
}
