//! DWO Agents Module
//!
//! Multi-agent orchestration system for distributing tasks across agents.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::Mutex;

/// Agent status
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum AgentStatus {
    Pending,
    Running,
    Completed,
    Failed,
}

/// Agent task configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentTask {
    pub id: String,
    pub name: String,
    pub agent_type: String,
    pub config: serde_json::Value,
    pub status: AgentStatus,
    pub progress: u8,
    pub output: Option<String>,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub completed_at: Option<chrono::DateTime<chrono::Utc>>,
}

/// Agent configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentConfig {
    pub id: String,
    pub name: String,
    pub r#type: String,
    pub enabled: bool,
    pub priority: u8,
    pub max_concurrent: u8,
}

/// Agent manager
#[derive(Clone)]
pub struct AgentManager {
    tasks: Arc<Mutex<HashMap<String, AgentTask>>>,
    configs: Arc<Mutex<HashMap<String, AgentConfig>>>,
}

impl AgentManager {
    /// Create a new AgentManager
    pub fn new() -> Self {
        Self {
            tasks: Arc::new(Mutex::new(HashMap::new())),
            configs: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    /// Get all tasks
    pub async fn list_tasks(&self) -> Vec<AgentTask> {
        self.tasks.lock().await.values().cloned().collect()
    }

    /// Get a task by ID
    pub async fn get_task(&self, id: &str) -> Option<AgentTask> {
        self.tasks.lock().await.get(id).cloned()
    }

    /// Create a new task
    pub async fn create_task(
        &self,
        name: &str,
        agent_type: &str,
        config: serde_json::Value,
    ) -> String {
        let id = format!("task_{}", uuid::Uuid::new_v4());
        let task = AgentTask {
            id: id.clone(),
            name: name.to_string(),
            agent_type: agent_type.to_string(),
            config,
            status: AgentStatus::Pending,
            progress: 0,
            output: None,
            created_at: chrono::Utc::now(),
            completed_at: None,
        };
        self.tasks.lock().await.insert(id.clone(), task);
        id
    }

    /// Update task status
    pub async fn update_task_status(&self, id: &str, status: AgentStatus, progress: u8, output: Option<String>) {
        if let Some(task) = self.tasks.lock().await.get_mut(id) {
            task.status = status.clone();
            task.progress = progress;
            task.output = output;
            if matches!(status, AgentStatus::Completed | AgentStatus::Failed) {
                task.completed_at = Some(chrono::Utc::now());
            }
        }
    }

    /// List agent configs
    pub async fn list_configs(&self) -> Vec<AgentConfig> {
        self.configs.lock().await.values().cloned().collect()
    }

    /// Add an agent config
    pub async fn add_config(&self, config: AgentConfig) {
        self.configs.lock().await.insert(config.id.clone(), config);
    }

    /// Remove an agent config
    pub async fn remove_config(&self, id: &str) {
        self.configs.lock().await.remove(id);
    }
}

impl Default for AgentManager {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_agent_manager() {
        let manager = AgentManager::new();

        // Create a task
        let task_id = manager.create_task("Test Task", "analyzer", serde_json::json!({})).await;
        assert_eq!(task_id.starts_with("task_"), true);

        // List tasks
        let tasks = manager.list_tasks().await;
        assert_eq!(tasks.len(), 1);
        assert_eq!(tasks[0].name, "Test Task");

        // Update task status
        manager.update_task_status(&task_id, AgentStatus::Running, 50, None).await;
        let task = manager.get_task(&task_id).await.unwrap();
        assert_eq!(task.status, AgentStatus::Running);
        assert_eq!(task.progress, 50);
    }
}
