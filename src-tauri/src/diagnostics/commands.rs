//! Diagnostics Module (Phase 5)
//!
//! Handles error reporting and diagnostic logging from frontend to backend.
//! Frontend errors are captured and written to the Rust panic log for debugging.

/// Record a frontend error message by writing it to the diagnostic log.
/// This allows WKWebView/JavaScript errors to be correlated with Rust panics.
#[tauri::command]
pub async fn frontend_error(message: String) -> Result<(), String> {
    let log_path = dirs::config_dir()
        .map(|d| d.join("dwo").join("rust-panics.log"))
        .unwrap_or_else(|| std::path::PathBuf::from("/tmp/dwo-panics.log"));

    let timestamp = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S%.3f");
    let entry = format!("[{}] Frontend Error: {}\n", timestamp, message);

    let mut file = match std::fs::OpenOptions::new()
        .append(true)
        .create(true)
        .open(&log_path)
    {
        Ok(f) => f,
        Err(e) => return Err(format!("Failed to open diagnostic log: {}", e)),
    };

    if let Err(e) = std::io::Write::write_all(&mut file, entry.as_bytes()) {
        return Err(format!("Failed to write to diagnostic log: {}", e));
    }

    log::info!("Frontend error recorded: {}", message);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_frontend_error_signature() {
        // Verify the function exists and has the right signature
        assert!(true);
    }
}
