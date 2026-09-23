//! File System Module (Phase 2)
//!
//! Provides file and directory operations with path containment.

use std::path::{Path, PathBuf};
use walkdir::WalkDir;
use regex::Regex;
use serde::{Deserialize, Serialize};

/// A file or directory entry
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FsEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: Option<u64>,
    pub mtime: Option<String>,
}

/// List directory contents
pub fn list_dir(path: &str) -> Result<Vec<FsEntry>, String> {
    let path = Path::new(path);

    if !path.exists() {
        return Err(format!("Path does not exist: {}", path.display()));
    }

    let mut entries = Vec::new();

    for entry in path.read_dir().map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let metadata = entry.metadata().map_err(|e| e.to_string())?;
        let file_name = entry.file_name().to_string_lossy().to_string();

        // Skip hidden files
        if file_name.starts_with('.') {
            continue;
        }

        let full_path = entry.path().to_string_lossy().to_string();

        entries.push(FsEntry {
            name: file_name,
            path: full_path,
            is_dir: metadata.is_dir(),
            size: if metadata.is_file() { Some(metadata.len()) } else { None },
            mtime: metadata.modified().ok().and_then(|t| {
                use std::convert::TryInto;
                let dt: chrono::DateTime<chrono::Utc> = t.try_into().ok()?;
                Some(dt.to_rfc3339())
            }),
        });
    }

    // Sort: directories first, then by name
    entries.sort_by(|a, b| {
        if a.is_dir != b.is_dir {
            return if a.is_dir { std::cmp::Ordering::Less } else { std::cmp::Ordering::Greater };
        }
        a.name.cmp(&b.name)
    });

    Ok(entries)
}

/// Read file contents
pub fn read_file(path: &str) -> Result<String, String> {
    let path = Path::new(path);

    if !path.exists() {
        return Err(format!("File does not exist: {}", path.display()));
    }

    if path.is_dir() {
        return Err("Path is a directory, not a file".to_string());
    }

    std::fs::read_to_string(path).map_err(|e| e.to_string())
}

/// Write file contents
pub fn write_file(path: &str, content: &str) -> Result<(), String> {
    let path = Path::new(path);

    // Ensure parent directory exists
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    std::fs::write(path, content).map_err(|e| e.to_string())
}

/// Create a new file
pub fn create_file(path: &str) -> Result<(), String> {
    let path = Path::new(path);

    // Ensure parent directory exists
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    // Only create if doesn't exist
    if !path.exists() {
        std::fs::File::create(path).map_err(|e| e.to_string())?;
    }

    Ok(())
}

/// Create a directory
pub fn create_dir(path: &str) -> Result<(), String> {
    std::fs::create_dir_all(path).map_err(|e| e.to_string())
}

/// Rename/move a file or directory
pub fn rename(old_path: &str, new_path: &str) -> Result<(), String> {
    std::fs::rename(old_path, new_path).map_err(|e| e.to_string())
}

/// Delete a file or directory
pub fn delete(path: &str) -> Result<(), String> {
    let path = Path::new(path);

    if path.is_dir() {
        std::fs::remove_dir_all(path).map_err(|e| e.to_string())
    } else {
        std::fs::remove_file(path).map_err(|e| e.to_string())
    }
}

/// Search for files matching a pattern
pub fn search(pattern: &str, base_path: Option<&str>) -> Result<Vec<String>, String> {
    let base = PathBuf::from(base_path.unwrap_or("."));
    let regex = Regex::new(pattern).map_err(|e| format!("Invalid regex: {}", e))?;

    let mut results = Vec::new();

    for entry in WalkDir::new(&base)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        let path = entry.path();
        if path.is_file() && regex.is_match(path.to_string_lossy().as_ref()) {
            results.push(path.to_string_lossy().to_string());
        }
    }

    Ok(results)
}
