//! Tauri command handlers for task automation

use crate::tasks::{Task, TaskManager, TaskResult, TaskStatus};
use tauri::State;

/// List all tasks
#[tauri::command]
pub async fn task_list(
    state: State<'_, TaskManager>
) -> Result<Vec<Task>, String> {
    Ok(state.list_tasks().await)
}

/// Get a specific task
#[tauri::command]
pub async fn task_get(
    id: String,
    state: State<'_, TaskManager>
) -> Result<Option<Task>, String> {
    Ok(state.get_task(&id).await)
}

/// Create a new task
#[tauri::command]
pub async fn task_create(
    name: String,
    description: String,
    schedule: String,
    command: String,
    working_dir: String,
    state: State<'_, TaskManager>
) -> Result<String, String> {
    let task = Task {
        id: format!("task_{}", uuid::Uuid::new_v4()),
        name,
        description,
        schedule,
        command,
        working_dir,
        status: TaskStatus::Active,
        last_run: None,
        next_run: None,
        created_at: chrono::Utc::now().to_rfc3339(),
    };
    Ok(state.create_task(task).await)
}

/// Update task status
#[tauri::command]
pub async fn task_update_status(
    id: String,
    status: String,
    state: State<'_, TaskManager>
) -> Result<(), String> {
    let task_status = match status.as_str() {
        "active" => TaskStatus::Active,
        "paused" => TaskStatus::Paused,
        "completed" => TaskStatus::Completed,
        "failed" => TaskStatus::Failed,
        _ => TaskStatus::Active,
    };
    state.update_status(&id, task_status).await;
    Ok(())
}

/// Delete a task
#[tauri::command]
pub async fn task_delete(
    id: String,
    state: State<'_, TaskManager>
) -> Result<bool, String> {
    Ok(state.delete_task(&id).await)
}

/// Save task result
#[tauri::command]
pub async fn task_save_result(
    task_id: String,
    started_at: String,
    completed_at: String,
    success: bool,
    output: String,
    exit_code: i32,
    state: State<'_, TaskManager>
) -> Result<(), String> {
    let result = TaskResult {
        task_id,
        started_at,
        completed_at,
        success,
        output,
        exit_code,
    };
    state.save_result(result).await;
    Ok(())
}

/// Get recent task results
#[tauri::command]
pub async fn task_get_results(
    limit: usize,
    state: State<'_, TaskManager>
) -> Result<Vec<TaskResult>, String> {
    Ok(state.get_results(limit).await)
}
