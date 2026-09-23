//! DWO Tasks Module
//!
//! Task automation and scheduling system.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::Mutex;

/// Task status
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum TaskStatus {
    Active,
    Paused,
    Completed,
    Failed,
}

/// Scheduled task
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Task {
    pub id: String,
    pub name: String,
    pub description: String,
    pub schedule: String, // Cron expression
    pub command: String,
    pub working_dir: String,
    pub status: TaskStatus,
    pub last_run: Option<String>,
    pub next_run: Option<String>,
    pub created_at: String,
}

/// Task result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskResult {
    pub task_id: String,
    pub started_at: String,
    pub completed_at: String,
    pub success: bool,
    pub output: String,
    pub exit_code: i32,
}

/// Task manager
#[derive(Clone)]
pub struct TaskManager {
    tasks: Arc<Mutex<HashMap<String, Task>>>,
    results: Arc<Mutex<Vec<TaskResult>>>,
}

impl TaskManager {
    /// Create a new TaskManager
    pub fn new() -> Self {
        Self {
            tasks: Arc::new(Mutex::new(HashMap::new())),
            results: Arc::new(Mutex::new(Vec::new())),
        }
    }

    /// List all tasks
    pub async fn list_tasks(&self) -> Vec<Task> {
        self.tasks.lock().await.values().cloned().collect()
    }

    /// Get a task by ID
    pub async fn get_task(&self, id: &str) -> Option<Task> {
        self.tasks.lock().await.get(id).cloned()
    }

    /// Create a new task
    pub async fn create_task(&self, task: Task) -> String {
        let id = task.id.clone();
        self.tasks.lock().await.insert(id.clone(), task);
        id
    }

    /// Update task status
    pub async fn update_status(&self, id: &str, status: TaskStatus) {
        if let Some(task) = self.tasks.lock().await.get_mut(id) {
            task.status = status;
        }
    }

    /// Save task result
    pub async fn save_result(&self, result: TaskResult) {
        self.results.lock().await.push(result);
    }

    /// Get recent results
    pub async fn get_results(&self, limit: usize) -> Vec<TaskResult> {
        let mut results = self.results.lock().await.clone();
        results.sort_by(|a, b| b.started_at.cmp(&a.started_at));
        results.into_iter().take(limit).collect()
    }

    /// Delete a task
    pub async fn delete_task(&self, id: &str) -> bool {
        self.tasks.lock().await.remove(id).is_some()
    }
}

impl Default for TaskManager {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_task_manager() {
        let manager = TaskManager::new();

        let task = Task {
            id: "test-task".to_string(),
            name: "Test Task".to_string(),
            description: "A test task".to_string(),
            schedule: "0 * * * *".to_string(),
            command: "echo hello".to_string(),
            working_dir: "/tmp".to_string(),
            status: TaskStatus::Active,
            last_run: None,
            next_run: None,
            created_at: chrono::Utc::now().to_rfc3339(),
        };

        manager.create_task(task).await;

        let tasks = manager.list_tasks().await;
        assert_eq!(tasks.len(), 1);
        assert_eq!(tasks[0].name, "Test Task");

        manager.update_status("test-task", TaskStatus::Paused).await;
        let task = manager.get_task("test-task").await.unwrap();
        assert_eq!(task.status, TaskStatus::Paused);
    }
}
