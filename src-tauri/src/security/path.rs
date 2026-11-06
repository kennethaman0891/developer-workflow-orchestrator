//! Security: Path Containment
//!
//! Validates that all file system operations stay within allowed directory roots.
//! Prevents path traversal attacks (CVE-style: ../../../etc/passwd).

use std::path::{Path, PathBuf};
use std::sync::{OnceLock, Mutex};

/// Global allowed roots for file operations.
/// Initialized once at startup from workspace paths.
static ALLOWED_ROOTS: OnceLock<Mutex<Vec<PathBuf>>> = OnceLock::new();

/// Initialize allowed roots from workspace paths.
/// Call this once at application startup.
pub fn init_allowed_roots(roots: Vec<PathBuf>) {
    let canonicalized: Vec<PathBuf> = roots
        .into_iter()
        .filter_map(|r| std::fs::canonicalize(&r).ok())
        .collect();
    let _ = ALLOWED_ROOTS.set(Mutex::new(canonicalized));
}

/// Add a new allowed root (e.g., when user opens a new workspace).
pub fn add_allowed_root(root: &Path) -> Result<(), String> {
    let canonical = std::fs::canonicalize(root).map_err(|e| e.to_string())?;
    let roots = ALLOWED_ROOTS.get_or_init(|| Mutex::new(Vec::new()));
    roots.lock().unwrap().push(canonical);
    Ok(())
}

/// Check if a path is within any allowed root.
/// Returns the canonicalized path if valid, or an error.
pub fn validate_path(path: &str) -> Result<PathBuf, String> {
    let path = Path::new(path);

    // Reject empty paths
    if path.as_os_str().is_empty() {
        return Err("Empty path".to_string());
    }

    // Resolve to absolute path (following symlinks)
    let canonical = match std::fs::canonicalize(path) {
        Ok(c) => c,
        Err(e) => {
            // If path doesn't exist yet (e.g., creating new file), try parent
            if path.parent().is_some() {
                validate_path_parent(path)?
            } else {
                return Err(e.to_string());
            }
        }
    };

    // Check against allowed roots
    if let Some(roots) = ALLOWED_ROOTS.get() {
        let roots = roots.lock().unwrap();
        if roots.is_empty() {
            return Err("No allowed roots configured".to_string());
        }
        for root in roots.iter() {
            if canonical.starts_with(root) {
                return Ok(canonical);
            }
        }
        return Err(format!(
            "Path '{}' is outside allowed roots",
            canonical.display()
        ));
    }

    // No roots configured yet - allow but warn (first run)
    log::warn!(
        "[security] No allowed roots configured, allowing path: {}",
        canonical.display()
    );
    Ok(canonical)
}

/// Validate a path that may not exist yet by checking its parent.
fn validate_path_parent(path: &Path) -> Result<PathBuf, String> {
    let parent = path.parent().ok_or("Path has no parent")?;
    let canonical_parent = std::fs::canonicalize(parent).map_err(|e| e.to_string())?;

    if let Some(roots) = ALLOWED_ROOTS.get() {
        let roots = roots.lock().unwrap();
        if roots.is_empty() {
            return Err("No allowed roots configured".to_string());
        }
        for root in roots.iter() {
            if canonical_parent.starts_with(root) {
                // Return the canonical parent joined with the final component
                return Ok(canonical_parent.join(path.file_name().unwrap()));
            }
        }
        return Err(format!(
            "Path '{}' parent is outside allowed roots",
            canonical_parent.display()
        ));
    }

    log::warn!(
        "[security] No allowed roots configured, allowing path parent: {}",
        canonical_parent.display()
    );
    Ok(canonical_parent.join(path.file_name().unwrap()))
}

/// Check if a path is safe (no traversal attempts) without resolving.
/// Fast check for early rejection of obvious attacks.
pub fn is_path_safe(path: &str) -> bool {
    let path = Path::new(path);
    let components: Vec<_> = path.components().collect();

    // Count parent directory references
    let parent_refs = components
        .iter()
        .filter(|c| matches!(c, std::path::Component::ParentDir))
        .count();

    // Reject if too many parent references (heuristic)
    if parent_refs > 2 {
        return false;
    }

    // Reject absolute paths that aren't under allowed roots (handled by validate_path)
    // But allow relative paths
    true
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn test_path_safe() {
        assert!(is_path_safe("project/src/main.rs"));
        assert!(is_path_safe("./project/src/main.rs"));
        assert!(!is_path_safe("../../../etc/passwd"));
        assert!(!is_path_safe("project/../../../etc/passwd"));
        assert!(is_path_safe("project/../project/src/main.rs")); // 1 parent ref
    }

    #[test]
    fn test_validate_path() {
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path().to_path_buf();

        init_allowed_roots(vec![root.clone()]);

        // Valid path inside root
        let valid = root.join("subdir").join("file.txt");
        fs::create_dir_all(valid.parent().unwrap()).unwrap();
        fs::write(&valid, "test").unwrap();

        assert!(validate_path(valid.to_str().unwrap()).is_ok());

        // Invalid path outside root
        let invalid = PathBuf::from("/etc/passwd");
        assert!(validate_path(invalid.to_str().unwrap()).is_err());
    }
}
