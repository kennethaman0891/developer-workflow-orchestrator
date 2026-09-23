//! State/Workspace Commands
//!
//! Tauri command handlers for workspace management.

use super::super::state::state::AppState;

/// Create a new workspace
#[tauri::command]
pub async fn create_workspace(
    state: tauri::State<'_, AppState>,
    name: String,
) -> Result<AppState, String> {
    let mut app_state = state.inner().clone();
    app_state.create_workspace(&name);
    Ok(app_state)
}

/// Rename a workspace
#[tauri::command]
pub async fn rename_workspace(
    state: tauri::State<'_, AppState>,
    id: String,
    new_name: String,
) -> Result<(), String> {
    let mut app_state = state.inner().clone();
    app_state.rename_workspace(&id, &new_name)
}

/// Close a workspace
#[tauri::command]
pub async fn close_workspace(
    state: tauri::State<'_, AppState>,
    id: String,
) -> Result<(), String> {
    let mut app_state = state.inner().clone();
    app_state.close_workspace(&id)
}

/// Load current state
#[tauri::command]
pub async fn load_workspace_state() -> Result<AppState, String> {
    AppState::load()
}

/// Save state
#[tauri::command]
pub async fn save_workspace_state(
    _state: tauri::State<'_, AppState>,
    new_state: AppState,
) -> Result<(), String> {
    new_state.save()
}

/// List all workspaces
#[tauri::command]
pub async fn list_workspaces(
    state: tauri::State<'_, AppState>,
) -> Result<Vec<AppState>, String> {
    Ok(vec![state.inner().clone()])
}
