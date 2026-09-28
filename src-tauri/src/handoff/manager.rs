//! HandoffManager — owns captured handoff artifacts and persists them to disk.

use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use parking_lot::RwLock;

use super::types::{HandoffArtifact, SessionSummary};
use crate::terminal::TerminalManager;

/// Maximum number of scrollback lines to inject into a receiving terminal.
const MAX_INJECT_LINES: usize = 80;

pub struct HandoffManager {
    artifacts: RwLock<HashMap<String, HandoffArtifact>>,
    data_dir: PathBuf,
}

impl HandoffManager {
    /// Create a new HandoffManager, loading any existing artifacts from disk.
    pub fn new(data_dir: PathBuf) -> Self {
        let mgr = Self {
            artifacts: RwLock::new(HashMap::new()),
            data_dir: data_dir.clone(),
        };
        // Create the directory if it doesn't exist yet.
        if let Err(e) = fs::create_dir_all(&data_dir) {
            log::warn!("Failed to create handoff dir {:?}: {}", data_dir, e);
        }
        let _ = mgr.load_all();
        mgr
    }

    /// Load every `.json` artifact file from disk into the in-memory store.
    ///
    /// A single corrupt file is skipped (with a warning) rather than aborting
    /// the entire load, so one bad artifact can't hide the rest.
    pub fn load_all(&self) -> Result<(), String> {
        let mut arts = self.artifacts.write();
        arts.clear();

        if !self.data_dir.exists() {
            return Ok(());
        }

        for entry in fs::read_dir(&self.data_dir).map_err(|e| e.to_string())? {
            let entry = match entry {
                Ok(e) => e,
                Err(e) => { log::warn!("[DWO] Skipping unreadable handoff dir entry: {}", e); continue; }
            };
            let path = entry.path();
            if path.extension().map_or(false, |ext| ext == "json") {
                let contents = match fs::read_to_string(&path) {
                    Ok(c) => c,
                    Err(e) => { log::warn!("Failed to read handoff artifact {:?}: {}", path, e); continue; }
                };
                match serde_json::from_str::<HandoffArtifact>(&contents) {
                    Ok(artifact) => { arts.insert(artifact.id.clone(), artifact); }
                    Err(e) => { log::warn!("Skipping bad handoff artifact {:?}: {}", path, e); }
                }
            }
        }

        log::info!(
            "[DWO] HandoffManager loaded {} artifact(s) from {:?}",
            arts.len(),
            self.data_dir
        );
        Ok(())
    }

    /// Save an artifact to disk as <data_dir>/<uuid>.json
    fn save(&self, artifact: &HandoffArtifact) -> Result<(), String> {
        let path = self.data_dir.join(format!("{}.json", artifact.id));
        let contents = serde_json::to_string_pretty(artifact)
            .map_err(|e| e.to_string())?;
        fs::write(&path, contents).map_err(|e| e.to_string())?;
        Ok(())
    }

    /// Capture the current scrollback + metadata from `source_id` into a new artifact.
    pub fn capture(
        &self,
        term_mgr: &TerminalManager,
        source_id: &str,
        title: &str,
        notes: Option<&str>,
    ) -> Result<SessionSummary, String> {
        // Read source session metadata.
        let meta = term_mgr.get_meta(source_id).ok_or_else(|| {
            format!("Source session not found: {}", source_id)
        })?;

        // Read scrollback.
        let scrollback = term_mgr
            .get_scrollback(source_id)?;

        let id = uuid::Uuid::new_v4().to_string();
        let created_at = chrono::Utc::now();
        let artifact = HandoffArtifact {
            id: id.clone(),
            source_session_id: source_id.to_string(),
            title: title.to_string(),
            created_at,
            cwd: meta.cwd.to_string_lossy().to_string(),
            columns: meta.columns,
            rows: meta.rows,
            scrollback: scrollback.clone(),
            notes: notes.map(|n| n.to_string()),
            line_count: scrollback.len(),
        };

        self.save(&artifact)?;
        self.artifacts.write().insert(id.clone(), artifact);

        Ok(SessionSummary {
            id: id.clone(),
            source_session_id: source_id.to_string(),
            title: title.to_string(),
            created_at,
            cwd: meta.cwd.to_string_lossy().to_string(),
            line_count: scrollback.len(),
        })
    }

    /// Inject a captured artifact into a target terminal's PTY.
    /// Uses a quoted heredoc so NO shell expansion happens — completely safe.
    pub fn inject(
        &self,
        term_mgr: &TerminalManager,
        target_id: &str,
        artifact_id: &str,
    ) -> Result<(), String> {
        let artifact = self.get(artifact_id).ok_or_else(|| {
            format!("Artifact not found: {}", artifact_id)
        })?;

        // Only include the last MAX_INJECT_LINES lines of scrollback.
        let tail_lines: Vec<&str> = artifact
            .scrollback
            .iter()
            .rev()
            .take(MAX_INJECT_LINES)
            .rev()
            .map(|s| s.as_str())
            .collect();

        // Unique delimiter unlikely to appear in terminal output.
        let delim = format!("__DWO_HND_{}", uuid::Uuid::new_v4());

        // Build header lines as owned Strings to avoid temporary lifetime issues.
        let source_line = format!(
            "Source: {}  |  CWD: {}  |  Created: {}",
            artifact.title,
            artifact.cwd,
            artifact.created_at.format("%Y-%m-%d %H:%M:%S"),
        );
        let lines_captured = format!("Lines captured: {}", tail_lines.len());

        let mut all_lines: Vec<String> = vec![
            String::new(),
            "═══ SESSION HANDOFF ═══".to_string(),
            source_line,
            lines_captured,
            String::new(),
        ];

        if let Some(ref notes) = artifact.notes {
            all_lines.push("── Notes ──────────────────────────".to_string());
            all_lines.push(notes.clone());
            all_lines.push("──────────────────────────────────".to_string());
        }

        // Append scrollback tail lines.
        for line in &tail_lines {
            all_lines.push((*line).to_string());
        }

        all_lines.push(String::new());
        all_lines.push("▶ Context loaded. What would you like to do next?".to_string());
        all_lines.push("═══════════════════════════════════".to_string());

        // Single quoted heredoc — no expansion of any kind.
        let script = format!("cat <<'{}'\n{}\n{}\n", delim, all_lines.join("\n"), delim);

        term_mgr.write(target_id, script.as_bytes()).map_err(|e| {
            format!("Failed to inject into target '{}': {}", target_id, e)
        })
    }

    /// List all captured artifacts as lightweight summaries.
    pub fn list(&self) -> Vec<SessionSummary> {
        self.artifacts
            .read()
            .values()
            .map(|a| SessionSummary {
                id: a.id.clone(),
                source_session_id: a.source_session_id.clone(),
                title: a.title.clone(),
                created_at: a.created_at,
                cwd: a.cwd.clone(),
                line_count: a.line_count,
            })
            .collect()
    }

    /// Get a full artifact by ID.
    pub fn get(&self, id: &str) -> Option<HandoffArtifact> {
        self.artifacts.read().get(id).cloned()
    }

    /// Delete an artifact both from memory and disk.
    pub fn delete(&self, id: &str) -> Result<(), String> {
        self.artifacts.write().remove(id);
        let path = self.data_dir.join(format!("{}.json", id));
        if path.exists() {
            fs::remove_file(&path).map_err(|e| e.to_string())?;
        }
        Ok(())
    }
}
