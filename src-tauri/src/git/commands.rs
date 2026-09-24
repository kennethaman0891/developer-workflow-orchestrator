//! Tauri command handlers for Git operations

use crate::git::git::{GitManager, GitResult, GitStatus};

/// Get git status for a given project path
#[tauri::command]
pub async fn git_status(
    project_path: String,
) -> Result<GitStatus, String> {
    let manager = GitManager::new(std::path::PathBuf::from(&project_path));
    manager.status().await
}

/// Stage a file
#[tauri::command]
pub async fn git_stage(
    project_path: String,
    file: String,
) -> Result<GitResult, String> {
    let manager = GitManager::new(std::path::PathBuf::from(&project_path));
    manager.stage(&file).await
}

/// Commit changes
#[tauri::command]
pub async fn git_commit(
    project_path: String,
    message: String,
) -> Result<GitResult, String> {
    let manager = GitManager::new(std::path::PathBuf::from(&project_path));
    manager.commit(&message).await
}

/// Get git log
#[tauri::command]
pub async fn git_log(
    project_path: String,
    limit: usize,
) -> Result<Vec<String>, String> {
    let manager = GitManager::new(std::path::PathBuf::from(&project_path));
    manager.log(limit).await
}

/// Get current branch
#[tauri::command]
pub async fn git_branch(
    project_path: String,
) -> Result<String, String> {
    let manager = GitManager::new(std::path::PathBuf::from(&project_path));
    manager.branch().await
}
