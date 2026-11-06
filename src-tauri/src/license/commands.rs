//! License Commands
//!
//! Tauri command handlers for license management.

use super::super::license::license::{LicenseManager, Tier};
use crate::security::audit;
use crate::security::validation::validate_string;

/// Activate a license
#[tauri::command]
pub async fn activate(
    state: tauri::State<'_, LicenseManager>,
    key: String,
    machine_id: Option<String>,
) -> Result<bool, String> {
    let mut lm = state.inner().clone();
    let mid = machine_id.unwrap_or_else(|| {
        // Generate a machine ID based on hostname
        std::env::var("HOSTNAME").unwrap_or_else(|_| "default-machine".to_string())
    });

    match lm.activate(&key, &mid) {
        Ok(_) => Ok(true),
        Err(e) => Err(e),
    }
}

/// Get license status
#[tauri::command]
pub async fn status(
    state: tauri::State<'_, LicenseManager>,
) -> Result<super::super::license::license::Tier, String> {
    Ok(state.inner().get_tier("default"))
}

/// Deactivate license
#[tauri::command]
pub async fn deactivate(
    state: tauri::State<'_, LicenseManager>,
) -> Result<bool, String> {
    let mut lm = state.inner().clone();
    let result = lm.deactivate("default");

    // Audit log
    if let Some(logger) = audit::audit_logger() {
        let event_type = if result {
            audit::AuditEventType::LicenseDeactivated
        } else {
            audit::AuditEventType::LicenseValidationFailure
        };
        logger.log(
            event_type,
            audit::Severity::Info,
            None,
            None,
            Some("default".to_string()),
            serde_json::json!({"success": result}),
        );
    }

    Ok(result)
}


/// Check current license status
#[tauri::command]
pub async fn check_status(
    state: tauri::State<'_, LicenseManager>,
) -> Result<Tier, String> {
    let lm = state.inner().clone();
    Ok(lm.get_tier("default"))
}