//! File System Commands
//!
//! Tauri command handlers for file system operations.

use crate::fs::fs::{self, FsEntry};

/// List directory contents
#[tauri::command]
pub async fn list_dir(path: String) -> Result<Vec<FsEntry>, String> {
    fs::list_dir(&path)
}

/// Read file contents
#[tauri::command]
pub async fn read_file(path: String) -> Result<String, String> {
    fs::read_file(&path)
}

/// Write file contents
#[tauri::command]
pub async fn write_file(path: String, content: String) -> Result<(), String> {
    fs::write_file(&path, &content)
}

/// Create a new file
#[tauri::command]
pub async fn create_file(path: String) -> Result<(), String> {
    fs::create_file(&path)
}

/// Create a directory
#[tauri::command]
pub async fn create_dir(path: String) -> Result<(), String> {
    fs::create_dir(&path)
}

/// Rename/move a file or directory
#[tauri::command]
pub async fn rename(old_path: String, new_path: String) -> Result<(), String> {
    fs::rename(&old_path, &new_path)
}

/// Delete a file or directory
#[tauri::command]
pub async fn delete(path: String) -> Result<(), String> {
    fs::delete(&path)
}

/// Search for files matching a pattern
#[tauri::command]
pub async fn search(pattern: String, path: Option<String>) -> Result<Vec<String>, String> {
    fs::search(&pattern, path.as_deref())
}
