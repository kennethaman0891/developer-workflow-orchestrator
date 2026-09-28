//! Types for the session handoff feature.

use serde::{Deserialize, Serialize};
use chrono::{DateTime, Utc};

/// A full handoff artifact — includes scrollback content for viewing.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HandoffArtifact {
    pub id: String,
    pub source_session_id: String,
    pub title: String,
    pub created_at: DateTime<Utc>,
    pub cwd: String,
    pub columns: u16,
    pub rows: u16,
    pub scrollback: Vec<String>,
    pub notes: Option<String>,
    pub line_count: usize,
}

/// Lightweight summary used for listing artifacts in the UI.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionSummary {
    pub id: String,
    pub source_session_id: String,
    pub title: String,
    pub created_at: DateTime<Utc>,
    pub cwd: String,
    pub line_count: usize,
}
