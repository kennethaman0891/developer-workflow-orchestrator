//! File System Commands
//!
//! Tauri command handlers for file system operations.

use crate::fs::fs::{
    self, FsEntry, SearchResponse, TreeListing, DEFAULT_MAX_DEPTH, DEFAULT_MAX_ENTRIES,
};

/// List directory contents
#[tauri::command]
pub async fn list_dir(path: String) -> Result<Vec<FsEntry>, String> {
    fs::list_dir(&path)
}

/// Recursively list a directory tree.
///
/// Applies the shared ignore rules (`node_modules`, `.git`, … plus the
/// walked root's `.gitignore`), never follows symlinks, and caps the result
/// at `max_depth` (default 12) levels / `max_entries` (default 20000)
/// entries — `truncated` is set when either cap is hit. The walk runs on the
/// blocking pool so it never stalls the async runtime.
#[tauri::command]
pub async fn list_tree(
    path: String,
    max_depth: Option<usize>,
    max_entries: Option<usize>,
) -> Result<TreeListing, String> {
    let depth = max_depth.unwrap_or(DEFAULT_MAX_DEPTH);
    let cap = max_entries.unwrap_or(DEFAULT_MAX_ENTRIES);

    let result = tokio::task::spawn_blocking(move || fs::list_tree(&path, depth, cap))
        .await
        .map_err(|e| format!("list_tree task failed: {}", e))?;
    result
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

/// Search file contents (legacy `Vec<String>` shape).
///
/// Thin compatibility wrapper over [`fs::search_content`]: runs the bounded
/// content search with default options and returns the de-duplicated paths of
/// the matching files. Kept as-is because the frontend invokes it as
/// `invoke<string[]>('search', …)`. Prefer [`search_files`] for structured
/// results (line numbers + `truncated` flag).
#[tauri::command]
pub async fn search(pattern: String, path: Option<String>) -> Result<Vec<String>, String> {
    let result = tokio::task::spawn_blocking(move || fs::search(&pattern, path.as_deref()))
        .await
        .map_err(|e| format!("search task failed: {}", e))?;
    result
}

/// Bounded, ripgrep-style content search.
///
/// Returns structured matches (`path`, `line_number`, `line_text`,
/// `byte_offset`) plus a `truncated` flag. Hard caps: 500 results, 2000ms
/// walk budget, 2MB per file; binary files (NUL sniff) and symlinks are
/// skipped, and `node_modules` / `target` / `dist` / `.gitignore`d paths are
/// never visited. `pattern` is a literal substring unless it compiles as a
/// regex of at most 512 bytes (invalid regex falls back to literal rather
/// than erroring). `case_sensitive` defaults to `true`; `glob` optionally
/// filters by file name (e.g. `*.rs`).
#[tauri::command]
pub async fn search_files(
    pattern: String,
    path: Option<String>,
    case_sensitive: Option<bool>,
    glob: Option<String>,
) -> Result<SearchResponse, String> {
    let result = tokio::task::spawn_blocking(move || {
        fs::search_content(&pattern, path.as_deref(), case_sensitive, glob.as_deref())
    })
    .await
    .map_err(|e| format!("search_files task failed: {}", e))?;
    result
}
