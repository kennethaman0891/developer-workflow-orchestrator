//! Workspace Index Commands
//!
//! Tauri command handlers for workspace ↔ session binding.

use super::index::WorkspaceIndex;

/// Record a session as belonging to a workspace (general binding)
#[tauri::command]
pub async fn workspace_index_set(
    state: tauri::State<'_, WorkspaceIndex>,
    workspace_id: String,
    session_id: String,
) -> Result<(), String> {
    state.set(&workspace_id, &session_id);
    Ok(())
}

/// Record a session for a specific pane index within a workspace
#[tauri::command]
pub async fn workspace_index_set_pane(
    state: tauri::State<'_, WorkspaceIndex>,
    workspace_id: String,
    pane_index: usize,
    session_id: String,
) -> Result<(), String> {
    state.set_pane(&workspace_id, pane_index, &session_id);
    Ok(())
}

/// Get all session IDs for a workspace
#[tauri::command]
pub async fn workspace_index_get(
    state: tauri::State<'_, WorkspaceIndex>,
    workspace_id: String,
) -> Result<Vec<String>, String> {
    Ok(state.get_sessions(&workspace_id))
}

/// Get the session ID for a specific pane index
#[tauri::command]
pub async fn workspace_index_get_pane(
    state: tauri::State<'_, WorkspaceIndex>,
    workspace_id: String,
    pane_index: usize,
) -> Result<Option<String>, String> {
    Ok(state.get_pane_session(&workspace_id, pane_index))
}

/// Remove a session from a workspace
#[tauri::command]
pub async fn workspace_index_remove_session(
    state: tauri::State<'_, WorkspaceIndex>,
    workspace_id: String,
    session_id: String,
) -> Result<(), String> {
    state.remove_session(&workspace_id, &session_id);
    Ok(())
}

/// Clear all sessions for a workspace
#[tauri::command]
pub async fn workspace_index_clear(
    state: tauri::State<'_, WorkspaceIndex>,
    workspace_id: String,
) -> Result<(), String> {
    state.clear(&workspace_id);
    Ok(())
}
