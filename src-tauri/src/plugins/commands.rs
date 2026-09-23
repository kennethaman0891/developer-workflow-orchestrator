//! Tauri command handlers for plugin management

use crate::plugins::{PluginManager, PluginManifest};
use tauri::State;

/// List all plugins
#[tauri::command]
pub async fn plugin_list(
    state: State<'_, PluginManager>
) -> Result<Vec<crate::plugins::PluginState>, String> {
    Ok(state.list_plugins().await)
}

/// Get a specific plugin
#[tauri::command]
pub async fn plugin_get(
    id: String,
    state: State<'_, PluginManager>
) -> Result<Option<crate::plugins::PluginState>, String> {
    Ok(state.get_plugin(&id).await)
}

/// Install a plugin
#[tauri::command]
pub async fn plugin_install(
    manifest: String,
    state: State<'_, PluginManager>
) -> Result<(), String> {
    let manifest: PluginManifest = match serde_json::from_str(&manifest) {
        Ok(v) => v,
        Err(e) => return Err(e.to_string()),
    };
    state.install_plugin(manifest).await;
    Ok(())
}

/// Remove a plugin
#[tauri::command]
pub async fn plugin_remove(
    id: String,
    state: State<'_, PluginManager>
) -> Result<bool, String> {
    Ok(state.remove_plugin(&id).await)
}

/// Toggle plugin enabled state
#[tauri::command]
pub async fn plugin_toggle(
    id: String,
    state: State<'_, PluginManager>
) -> Result<(), String> {
    state.toggle_plugin(&id).await;
    Ok(())
}

/// Get enabled plugins
#[tauri::command]
pub async fn plugin_enabled(
    state: State<'_, PluginManager>
) -> Result<Vec<PluginManifest>, String> {
    Ok(state.enabled_plugins().await)
}
