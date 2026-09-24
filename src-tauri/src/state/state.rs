//! State/Workspace Module (Phase 2)
//!
//! Manages workspace persistence via JSON state file.

use std::path::PathBuf;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// A single terminal pane slot within a workspace.
/// `tty` holds the session id once a terminal is spawned; `None` means empty.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PaneSlot {
    /// Session id of the terminal in this pane, if any.
    pub tty: Option<String>,
}

impl PaneSlot {
    pub fn empty() -> Self {
        Self { tty: None }
    }
}

/// Workspace state persisted to disk
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Workspace {
    pub id: String,
    pub name: String,
    /// Project folder path selected via system file picker (e.g. /Users/me/project)
    pub path: Option<String>,
    /// Number of terminal panes in the grid layout (1, 2, 4, 6, 8, 10, 12, 14, 16)
    #[serde(default)]
    pub template: Option<u8>,
    /// Accent color for the workspace identity dot / highlight
    #[serde(default)]
    pub color: Option<String>,
    /// CLI command to auto-launch in every pane (e.g. "opencode", "claude", "codex")
    #[serde(default)]
    pub command: Option<String>,
    /// Pane slots — one per terminal in the template grid
    #[serde(default)]
    pub panes: Vec<PaneSlot>,
    pub created_at: String,
    pub updated_at: String,
}

impl Workspace {
    pub fn new(name: &str, path: Option<&str>, template: Option<u8>, command: Option<&str>, color: Option<&str>) -> Self {
        let now = chrono::Utc::now().to_rfc3339();
        let template_count = template.unwrap_or(1) as usize;
        let panes: Vec<PaneSlot> = (0..template_count).map(|_| PaneSlot::empty()).collect();
        Self {
            id: Uuid::new_v4().to_string(),
            name: name.to_string(),
            path: path.map(|p| p.to_string()),
            template,
            color: color.map(|c| c.to_string()),
            command: command.map(|c| c.to_string()),
            panes,
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

    /// Create a new workspace with all fields
    pub fn create_workspace(
        &mut self,
        name: &str,
        path: Option<&str>,
        template: Option<u8>,
        command: Option<&str>,
        color: Option<&str>,
    ) -> &Workspace {
        let ws = Workspace::new(name, path, template, command, color);
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

    /// Update a workspace field (path, command, template, color)
    pub fn update_workspace(
        &mut self,
        id: &str,
        path: Option<&str>,
        command: Option<&str>,
        template: Option<u8>,
        color: Option<&str>,
    ) -> Result<(), String> {
        if let Some(ws) = self.workspaces.iter_mut().find(|w| w.id == id) {
            if let Some(p) = path {
                ws.path = Some(p.to_string());
            }
            if command.is_some() {
                ws.command = command.map(|c| c.to_string());
            }
            if let Some(t) = template {
                ws.template = Some(t);
                // Resize pane slots to match new template
                let count = t as usize;
                while ws.panes.len() < count {
                    ws.panes.push(PaneSlot::empty());
                }
                ws.panes.truncate(count);
            }
            if color.is_some() {
                ws.color = color.map(|c| c.to_string());
            }
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

    /// Get mutable workspace by ID
    pub fn get_workspace_mut(&mut self, id: &str) -> Option<&mut Workspace> {
        self.workspaces.iter_mut().find(|w| w.id == id)
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
