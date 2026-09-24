//! State/Workspace Commands
//!
//! Tauri command handlers for workspace management.
//!
//! AppState is managed as `Mutex<AppState>` so every mutation is written
//! back into the managed state (not just a discarded clone). This keeps
//! `list_workspaces` / `get_workspace_state` in sync with the frontend.

use std::sync::Mutex;
use super::super::state::state::{AppState, Workspace};

/// Create a new workspace with full fields
#[tauri::command]
pub async fn create_workspace(
    state: tauri::State<'_, Mutex<AppState>>,
    name: String,
    path: Option<String>,
    template: Option<u8>,
    command: Option<String>,
    color: Option<String>,
) -> Result<Vec<Workspace>, String> {
    let mut app_state = state.lock().map_err(|e| e.to_string())?;
    app_state.create_workspace(
        &name,
        path.as_deref(),
        template,
        command.as_deref(),
        color.as_deref(),
    );
    app_state.save().map_err(|e| e.to_string())?;
    Ok(app_state.workspaces.clone())
}

/// Rename a workspace
#[tauri::command]
pub async fn rename_workspace(
    state: tauri::State<'_, Mutex<AppState>>,
    id: String,
    new_name: String,
) -> Result<(), String> {
    let mut app_state = state.lock().map_err(|e| e.to_string())?;
    app_state.rename_workspace(&id, &new_name)?;
    app_state.save().map_err(|e| e.to_string())
}

/// Close a workspace
#[tauri::command]
pub async fn close_workspace(
    state: tauri::State<'_, Mutex<AppState>>,
    id: String,
) -> Result<(), String> {
    let mut app_state = state.lock().map_err(|e| e.to_string())?;
    app_state.close_workspace(&id)?;
    app_state.save().map_err(|e| e.to_string())
}

/// Load current state
#[tauri::command]
pub async fn load_workspace_state() -> Result<AppState, String> {
    AppState::load()
}

/// Save state
#[tauri::command]
pub async fn save_workspace_state(
    state: tauri::State<'_, Mutex<AppState>>,
    new_state: AppState,
) -> Result<(), String> {
    new_state.save()?;
    let mut app_state = state.lock().map_err(|e| e.to_string())?;
    *app_state = new_state;
    Ok(())
}

/// List all workspaces
#[tauri::command]
pub async fn list_workspaces(
    state: tauri::State<'_, Mutex<AppState>>,
) -> Result<Vec<Workspace>, String> {
    let app_state = state.lock().map_err(|e| e.to_string())?;
    Ok(app_state.workspaces.clone())
}

/// Get the active workspace ID and full state
#[tauri::command]
pub async fn get_workspace_state(
    state: tauri::State<'_, Mutex<AppState>>,
) -> Result<AppState, String> {
    let app_state = state.lock().map_err(|e| e.to_string())?;
    Ok(app_state.clone())
}

/// Activate a workspace by ID
#[tauri::command]
pub async fn activate_workspace(
    state: tauri::State<'_, Mutex<AppState>>,
    id: String,
) -> Result<AppState, String> {
    let mut app_state = state.lock().map_err(|e| e.to_string())?;
    app_state.activate_workspace(&id)?;
    app_state.save().map_err(|e| e.to_string())?;
    Ok(app_state.clone())
}

/// Update a workspace's fields (path, command, template, color)
#[tauri::command]
pub async fn update_workspace(
    state: tauri::State<'_, Mutex<AppState>>,
    id: String,
    path: Option<String>,
    command: Option<String>,
    template: Option<u8>,
    color: Option<String>,
) -> Result<Vec<Workspace>, String> {
    let mut app_state = state.lock().map_err(|e| e.to_string())?;
    app_state.update_workspace(
        &id,
        path.as_deref(),
        command.as_deref(),
        template,
        color.as_deref(),
    )?;
    app_state.save().map_err(|e| e.to_string())?;
    Ok(app_state.workspaces.clone())
}

/// Open a system folder picker dialog and return the selected path
#[tauri::command]
pub async fn select_workspace_folder(app: tauri::AppHandle) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;

    let pick = app
        .dialog()
        .file()
        .set_title("Select Project Folder")
        .blocking_pick_folder();

    Ok(pick.and_then(|p| p.into_path().ok()).map(|p| p.to_string_lossy().to_string()))
}

/// Get the launch working directory written by the CLI wrapper.
/// Returns the path if it exists and is a directory, otherwise None.
#[tauri::command]
pub async fn get_launch_cwd() -> Result<Option<String>, String> {
    let cwd_path = dirs::config_dir()
        .map(|d| d.join("dwo").join("launch-cwd"))
        .unwrap_or_else(|| std::path::PathBuf::from("/tmp/dwo-launch-cwd"));

    if cwd_path.exists() {
        let content = std::fs::read_to_string(&cwd_path).map_err(|e| e.to_string())?;
        let path_str = content.trim().to_string();
        if !path_str.is_empty() {
            let p = std::path::PathBuf::from(&path_str);
            if p.is_dir() {
                // Clean up the launch-cwd file after reading
                let _ = std::fs::remove_file(&cwd_path);
                return Ok(Some(path_str));
            }
        }
        // Clean up even if invalid
        let _ = std::fs::remove_file(&cwd_path);
    }
    Ok(None)
}