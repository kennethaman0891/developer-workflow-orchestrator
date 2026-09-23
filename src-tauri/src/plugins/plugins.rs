//! DWO Plugins Module
//!
//! Plugin system for extending DWO functionality.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::Mutex;

/// Plugin manifest
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PluginManifest {
    pub id: String,
    pub name: String,
    pub description: String,
    pub version: String,
    pub author: String,
    pub enabled: bool,
    pub config: serde_json::Value,
}

/// Plugin state
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PluginState {
    pub manifest: PluginManifest,
    pub installed_at: String,
    pub updated_at: Option<String>,
}

/// Plugin manager
#[derive(Clone)]
pub struct PluginManager {
    plugins: Arc<Mutex<HashMap<String, PluginState>>>,
}

impl PluginManager {
    /// Create a new PluginManager
    pub fn new() -> Self {
        Self {
            plugins: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    /// List all plugins
    pub async fn list_plugins(&self) -> Vec<PluginState> {
        self.plugins.lock().await.values().cloned().collect()
    }

    /// Get a plugin by ID
    pub async fn get_plugin(&self, id: &str) -> Option<PluginState> {
        self.plugins.lock().await.get(id).cloned()
    }

    /// Install a plugin
    pub async fn install_plugin(&self, manifest: PluginManifest) {
        let state = PluginState {
            manifest: manifest.clone(),
            installed_at: chrono::Utc::now().to_rfc3339(),
            updated_at: None,
        };
        self.plugins.lock().await.insert(manifest.id.clone(), state);
    }

    /// Remove a plugin
    pub async fn remove_plugin(&self, id: &str) -> bool {
        self.plugins.lock().await.remove(id).is_some()
    }

    /// Toggle plugin enabled state
    pub async fn toggle_plugin(&self, id: &str) {
        if let Some(state) = self.plugins.lock().await.get_mut(id) {
            state.manifest.enabled = !state.manifest.enabled;
            state.updated_at = Some(chrono::Utc::now().to_rfc3339());
        }
    }

    /// Get enabled plugins
    pub async fn enabled_plugins(&self) -> Vec<PluginManifest> {
        self.plugins
            .lock()
            .await
            .values()
            .filter(|p| p.manifest.enabled)
            .map(|p| p.manifest.clone())
            .collect()
    }
}

impl Default for PluginManager {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_plugin_manager() {
        let manager = PluginManager::new();

        let manifest = PluginManifest {
            id: "test-plugin".to_string(),
            name: "Test Plugin".to_string(),
            description: "A test plugin".to_string(),
            version: "1.0.0".to_string(),
            author: "Test Author".to_string(),
            enabled: true,
            config: serde_json::json!({}),
        };

        manager.install_plugin(manifest).await;

        let plugins = manager.list_plugins().await;
        assert_eq!(plugins.len(), 1);
        assert_eq!(plugins[0].manifest.name, "Test Plugin");

        manager.toggle_plugin("test-plugin").await;
        let plugin = manager.get_plugin("test-plugin").await.unwrap();
        assert_eq!(plugin.manifest.enabled, false);
    }
}
