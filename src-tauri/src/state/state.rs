//! State/Workspace Module (Phase 2)
//!
//! Manages workspace persistence via JSON state file.

use std::path::PathBuf;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// Workspace state persisted to disk
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Workspace {
    pub id: String,
    pub name: String,
    /// Project folder path selected via system file picker (e.g. /Users/me/project)
    pub path: Option<String>,
    pub panes: Vec<String>,
    pub created_at: String,
    pub updated_at: String,
}

impl Workspace {
    pub fn new(name: &str, path: Option<&str>) -> Self {
        let now = chrono::Utc::now().to_rfc3339();
        Self {
            id: Uuid::new_v4().to_string(),
            name: name.to_string(),
            path: path.map(|p| p.to_string()),
            panes: Vec::new(),
            created_at: now.clone(),
            updated_at: now,
        }
    }
}

/// Application state holder
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppState {
    pub workspaces: Vec<Workspace>,
    pub active_workspace_id: Option<String>,
    pub tier: String,
    pub license_key: Option<String>,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            workspaces: Vec::new(),
            active_workspace_id: None,
            tier: "free".to_string(),
            license_key: None,
        }
    }
}

impl AppState {
    /// Get the path to the state file
    pub fn state_path() -> PathBuf {
        dirs::config_dir()
            .map(|d| d.join("dwo").join("state.json"))
            .unwrap_or_else(|| PathBuf::from("/tmp/dwo-state.json"))
    }

    /// Load state from disk
    pub fn load() -> Result<Self, String> {
        let path = Self::state_path();
        if path.exists() {
            let content = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
            serde_json::from_str(&content).map_err(|e| e.to_string())
        } else {
            Ok(Self::default())
        }
    }

    /// Save state to disk
    pub fn save(&self) -> Result<(), String> {
        let path = Self::state_path();

        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }

        let content = serde_json::to_string_pretty(self).map_err(|e| e.to_string())?;
        std::fs::write(&path, content).map_err(|e| e.to_string())
    }

    /// Create a new workspace
    pub fn create_workspace(&mut self, name: &str, path: Option<&str>) -> &Workspace {
        let ws = Workspace::new(name, path);
        self.workspaces.push(ws);
        self.active_workspace_id = Some(self.workspaces.last().unwrap().id.clone());
        self.save().ok();
        self.workspaces.last().unwrap()
    }

    /// Set the project path for a workspace
    pub fn set_workspace_path(&mut self, id: &str, path: &str) -> Result<(), String> {
        if let Some(ws) = self.workspaces.iter_mut().find(|w| w.id == id) {
            ws.path = Some(path.to_string());
            ws.updated_at = chrono::Utc::now().to_rfc3339();
            self.save().map_err(|e| e.to_string())?;
            Ok(())
        } else {
            Err(format!("Workspace not found: {}", id))
        }
    }

    /// Get a workspace by ID
    pub fn get_workspace(&self, id: &str) -> Option<&Workspace> {
        self.workspaces.iter().find(|w| w.id == id)
    }

    /// Update workspace name
    pub fn rename_workspace(&mut self, id: &str, new_name: &str) -> Result<(), String> {
        if let Some(ws) = self.workspaces.iter_mut().find(|w| w.id == id) {
            ws.name = new_name.to_string();
            ws.updated_at = chrono::Utc::now().to_rfc3339();
            self.save().map_err(|e| e.to_string())?;
            Ok(())
        } else {
            Err(format!("Workspace not found: {}", id))
        }
    }

    /// Close/remove a workspace
    pub fn close_workspace(&mut self, id: &str) -> Result<(), String> {
        let idx = self.workspaces.iter().position(|w| w.id == id)
            .ok_or_else(|| format!("Workspace not found: {}", id))?;

        self.workspaces.remove(idx);

        // Set active to first remaining or null
        if self.active_workspace_id == Some(id.to_string()) {
            self.active_workspace_id = self.workspaces.first().map(|w| w.id.clone());
        }

        self.save().map_err(|e| e.to_string())?;
        Ok(())
    }

    /// Activate a workspace
    pub fn activate_workspace(&mut self, id: &str) -> Result<(), String> {
        if self.workspaces.iter().any(|w| w.id == id) {
            self.active_workspace_id = Some(id.to_string());
            self.save().map_err(|e| e.to_string())?;
            Ok(())
        } else {
            Err(format!("Workspace not found: {}", id))
        }
    }
}
