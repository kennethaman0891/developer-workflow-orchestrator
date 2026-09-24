//! Workspace Index
//!
//! Maps workspace_id → Vec<session_id> so terminal sessions can be
//! re-associated with their workspace after a restart. Persisted to
//! `~/.config/dwo/workspace-index.json`.

use std::collections::HashMap;
use std::path::PathBuf;
use parking_lot::RwLock;
use serde::{Deserialize, Serialize};

/// Persisted index mapping workspace IDs to their session IDs
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct WorkspaceIndexData {
    /// workspace_id → list of session_ids assigned to its panes
    pub bindings: HashMap<String, Vec<String>>,
}

/// Thread-safe in-memory workspace index with disk persistence
pub struct WorkspaceIndex {
    data: RwLock<WorkspaceIndexData>,
}

impl WorkspaceIndex {
    /// Path to the persisted index file
    fn index_path() -> PathBuf {
        dirs::config_dir()
            .map(|d| d.join("dwo").join("workspace-index.json"))
            .unwrap_or_else(|| PathBuf::from("/tmp/dwo-workspace-index.json"))
    }

    /// Create a new WorkspaceIndex, loading from disk if available
    pub fn new() -> Self {
        let data = Self::load_from_disk().unwrap_or_default();
        Self {
            data: RwLock::new(data),
        }
    }

    /// Load persisted index from disk
    fn load_from_disk() -> Result<WorkspaceIndexData, String> {
        let path = Self::index_path();
        if path.exists() {
            let content = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
            serde_json::from_str(&content).map_err(|e| e.to_string())
        } else {
            Ok(WorkspaceIndexData::default())
        }
    }

    /// Save the current index to disk
    fn save_to_disk(&self) -> Result<(), String> {
        let path = Self::index_path();
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        let data = self.data.read().clone();
        let content = serde_json::to_string_pretty(&data).map_err(|e| e.to_string())?;
        std::fs::write(&path, content).map_err(|e| e.to_string())
    }

    /// Record a session as belonging to a workspace (by pane index)
    pub fn set(&self, workspace_id: &str, session_id: &str) {
        let mut data = self.data.write();
        let sessions = data.bindings
            .entry(workspace_id.to_string())
            .or_insert_with(Vec::new);
        // Avoid duplicates
        if !sessions.contains(&session_id.to_string()) {
            sessions.push(session_id.to_string());
        }
        drop(data);
        let _ = self.save_to_disk();
    }

    /// Set session for a specific pane index within a workspace
    pub fn set_pane(&self, workspace_id: &str, pane_index: usize, session_id: &str) {
        let mut data = self.data.write();
        let sessions = data.bindings
            .entry(workspace_id.to_string())
            .or_insert_with(Vec::new);
        // Extend if needed
        while sessions.len() <= pane_index {
            sessions.push(String::new());
        }
        sessions[pane_index] = session_id.to_string();
        drop(data);
        let _ = self.save_to_disk();
    }

    /// Get all session IDs for a workspace
    pub fn get_sessions(&self, workspace_id: &str) -> Vec<String> {
        let data = self.data.read();
        data.bindings
            .get(workspace_id)
            .cloned()
            .unwrap_or_default()
    }

    /// Get the session ID for a specific pane index
    pub fn get_pane_session(&self, workspace_id: &str, pane_index: usize) -> Option<String> {
        let data = self.data.read();
        data.bindings
            .get(workspace_id)
            .and_then(|sessions| sessions.get(pane_index))
            .filter(|s| !s.is_empty())
            .cloned()
    }

    /// Remove a session from a workspace
    pub fn remove_session(&self, workspace_id: &str, session_id: &str) {
        let mut data = self.data.write();
        if let Some(sessions) = data.bindings.get_mut(workspace_id) {
            sessions.retain(|s| s != session_id);
            if sessions.is_empty() {
                data.bindings.remove(workspace_id);
            }
        }
        drop(data);
        let _ = self.save_to_disk();
    }

    /// Clear all sessions for a workspace
    pub fn clear(&self, workspace_id: &str) {
        let mut data = self.data.write();
        data.bindings.remove(workspace_id);
        drop(data);
        let _ = self.save_to_disk();
    }

    /// Clear all bindings (full reset)
    pub fn clear_all(&self) {
        let mut data = self.data.write();
        data.bindings.clear();
        drop(data);
        let _ = self.save_to_disk();
    }
}
