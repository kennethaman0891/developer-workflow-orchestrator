//! License Commands
//!
//! Tauri command handlers for license management.

use super::super::license::license::LicenseManager;

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
    Ok(lm.deactivate("default"))
}
