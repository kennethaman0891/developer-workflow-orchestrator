//! Tauri command handlers for Git operations

use crate::git::GitManager;
use tauri::State;

/// Get git status
#[tauri::command]
pub async fn git_status(
    state: State<'_, GitManager>
) -> Result<crate::git::GitStatus, String> {
    state.status().await
}

/// Stage a file
#[tauri::command]
pub async fn git_stage(
    file: String,
    state: State<'_, GitManager>
) -> Result<crate::git::GitResult, String> {
    state.stage(&file).await
}

/// Commit changes
#[tauri::command]
pub async fn git_commit(
    message: String,
    state: State<'_, GitManager>
) -> Result<crate::git::GitResult, String> {
    state.commit(&message).await
}

/// Get git log
#[tauri::command]
pub async fn git_log(
    limit: usize,
    state: State<'_, GitManager>
) -> Result<Vec<String>, String> {
    state.log(limit).await
}

/// Get current branch
#[tauri::command]
pub async fn git_branch(
    state: State<'_, GitManager>
) -> Result<String, String> {
    state.branch().await
}
