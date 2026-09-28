//! Tauri command handlers for session handoff.

use super::manager::HandoffManager;
use super::types::{HandoffArtifact, SessionSummary};
use crate::terminal::TerminalManager;

/// Capture the active terminal's context into a portable handoff artifact.
#[tauri::command]
pub async fn handoff_capture(
    handoff: tauri::State<'_, HandoffManager>,
    term: tauri::State<'_, TerminalManager>,
    source_id: String,
    title: Option<String>,
    notes: Option<String>,
) -> Result<SessionSummary, String> {
    handoff.capture(&term, &source_id, title.as_deref().unwrap_or("Untitled"), notes.as_deref())
}

/// List all captured handoff artifacts.
#[tauri::command]
pub async fn handoff_list(
    handoff: tauri::State<'_, HandoffManager>,
) -> Result<Vec<SessionSummary>, String> {
    Ok(handoff.list())
}

/// Get the full artifact including scrollback by ID.
#[tauri::command]
pub async fn handoff_get(
    handoff: tauri::State<'_, HandoffManager>,
    id: String,
) -> Result<Option<HandoffArtifact>, String> {
    Ok(handoff.get(&id))
}

/// Inject a captured artifact into a target terminal's PTY.
#[tauri::command]
pub async fn handoff_inject(
    handoff: tauri::State<'_, HandoffManager>,
    term: tauri::State<'_, TerminalManager>,
    target_id: String,
    artifact_id: String,
) -> Result<(), String> {
    handoff.inject(&term, &target_id, &artifact_id)
}

/// Delete a captured artifact.
#[tauri::command]
pub async fn handoff_delete(
    handoff: tauri::State<'_, HandoffManager>,
    id: String,
) -> Result<(), String> {
    handoff.delete(&id)
}
