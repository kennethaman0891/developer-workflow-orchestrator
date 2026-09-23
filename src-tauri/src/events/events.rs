//! DWO Events Module
//!
//! Handles event emission and subscription for real-time communication
//! between frontend and backend.

use serde::{Deserialize, Serialize};

/// Event types that can be emitted
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "data")]
pub enum DwoEvent {
    /// Terminal output event
    TerminalOutput {
        session_id: String,
        data: String,
    },
    /// File change event
    FileChanged {
        path: String,
        action: String,
    },
    /// Agent task event
    AgentTask {
        agent_id: String,
        task_id: String,
        status: String,
        output: Option<String>,
    },
    /// Collaboration event
    CollaborationUpdate {
        user_id: String,
        action: String,
        data: serde_json::Value,
    },
}

impl DwoEvent {
    /// Get the event name
    pub fn event_name(&self) -> &'static str {
        match self {
            DwoEvent::TerminalOutput { .. } => "terminal-output",
            DwoEvent::FileChanged { .. } => "file-changed",
            DwoEvent::AgentTask { .. } => "agent-task",
            DwoEvent::CollaborationUpdate { .. } => "collaboration-update",
        }
    }
}

/// Emit an event to all listeners
pub fn emit_event<R: tauri::Runtime, E: tauri::Emitter<R> + Clone>(event: &DwoEvent, emitter: &E) -> Result<(), String> {
    emitter.emit(event.event_name(), event).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_event_names() {
        assert_eq!(
            DwoEvent::TerminalOutput {
                session_id: "test".to_string(),
                data: "output".to_string()
            }
            .event_name(),
            "terminal-output"
        );
        assert_eq!(
            DwoEvent::FileChanged {
                path: "/test".to_string(),
                action: "modified".to_string()
            }
            .event_name(),
            "file-changed"
        );
        assert_eq!(
            DwoEvent::AgentTask {
                agent_id: "agent1".to_string(),
                task_id: "task1".to_string(),
                status: "running".to_string(),
                output: None
            }
            .event_name(),
            "agent-task"
        );
        assert_eq!(
            DwoEvent::CollaborationUpdate {
                user_id: "user1".to_string(),
                action: "edit".to_string(),
                data: serde_json::json!({})
            }
            .event_name(),
            "collaboration-update"
        );
    }
}
