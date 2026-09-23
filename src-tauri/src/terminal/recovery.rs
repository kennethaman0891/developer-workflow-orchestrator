//! Recovery Utilities
//!
//! Handles crash recovery and session restoration.

use std::path::PathBuf;
use std::fs;

/// Default panic log path
pub fn panic_log_path() -> PathBuf {
    dirs::config_dir()
        .map(|d| d.join("dwo").join("rust-panics.log"))
        .unwrap_or_else(|| PathBuf::from("/tmp/dwo-panics.log"))
}

/// Check if there's a recent panic log
pub fn has_recent_panic(max_age_seconds: u64) -> bool {
    let path = panic_log_path();
    if !path.exists() {
        return false;
    }

    match fs::metadata(&path) {
        Ok(meta) => {
            use std::time::{SystemTime, UNIX_EPOCH};
            let elapsed = SystemTime::now()
                .duration_since(meta.modified().unwrap_or(UNIX_EPOCH))
                .unwrap_or_default()
                .as_secs();
            elapsed < max_age_seconds
        }
        Err(_) => false,
    }
}

/// Clear the panic log
pub fn clear_panic_log() -> Result<(), String> {
    let path = panic_log_path();
    if path.exists() {
        fs::remove_file(&path).map_err(|e| e.to_string())?;
    }
    Ok(())
}
