//! Security Module
//!
//! Comprehensive security layer for DWO:
//! - Path containment (prevents directory traversal)
//! - Audit logging (tamper-evident)
//! - Rate limiting (token bucket)
//! - Encrypted storage (ChaCha20-Poly1305)
//! - Session management

pub mod path;
pub mod audit;
pub mod ratelimit;
pub mod encrypted_storage;
pub mod session;
pub mod commands;
pub mod validation;




use tauri::Manager;
use serde_json::json;

/// Initialize all security subsystems
pub fn init_security(app: &tauri::App) -> Result<(), String> {
    // Initialize audit logger
    audit::init_audit_logger()?;

    // Rate limiter is lazily initialized

    // Session manager with 24h TTL, max 10 sessions per user
    session::init_session_manager(24, 10);

    // Master encryption key - in production, load from secure storage
    // For now, generate ephemeral key (persists only for session)
    encrypted_storage::init_master_key(None)?;

    // Initialize allowed roots from workspace state
    if let Some(state) = app.try_state::<std::sync::Mutex<crate::state::state::AppState>>() {
        if let Ok(state) = state.lock() {
            let roots: Vec<std::path::PathBuf> = state
                .workspaces
                .iter()
                .filter_map(|ws| ws.path.as_ref())
                .filter_map(|p| std::fs::canonicalize(p).ok())
                .collect();
            if !roots.is_empty() {
                path::init_allowed_roots(roots);
            }
        }
    }

    // Log app start
    if let Some(logger) = audit::audit_logger() {
        let version = env!("CARGO_PKG_VERSION");
        let details = serde_json::json!({
            "version": version,
            "build_timestamp": option_env!("BUILD_TIMESTAMP").unwrap_or("unknown")
        });
        logger.log(audit::AuditEventType::AppStart, audit::Severity::Info, None, None, None, details);
    };

    Ok(())
}

/// Called when a workspace is added/opened
pub fn on_workspace_opened(path: &std::path::Path) -> Result<(), String> {
    path::add_allowed_root(path)
}

/// Called when a workspace is closed
pub fn on_workspace_closed(path: &std::path::Path) -> Result<(), String> {
    // Note: We don't remove roots as other workspaces might share parent directories
    // In a more sophisticated implementation, we'd track reference counts
    Ok(())
}
