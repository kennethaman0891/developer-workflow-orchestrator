//! Tauri command handlers for agent orchestration

use crate::agents::{AgentConfig, AgentManager, AgentStatus};
use tauri::State;

/// List all agent tasks
#[tauri::command]
pub async fn agent_list_tasks(
    state: State<'_, AgentManager>
) -> Result<Vec<crate::agents::AgentTask>, String> {
    Ok(state.list_tasks().await)
}

/// Get a specific agent task
#[tauri::command]
pub async fn agent_get_task(
    id: String,
    state: State<'_, AgentManager>
) -> Result<Option<crate::agents::AgentTask>, String> {
    Ok(state.get_task(&id).await)
}

/// Create a new agent task
#[tauri::command]
pub async fn agent_create_task(
    name: String,
    agent_type: String,
    config: String,
    state: State<'_, AgentManager>
) -> Result<String, String> {
    let config_value: serde_json::Value = match serde_json::from_str(&config) {
        Ok(v) => v,
        Err(e) => return Err(e.to_string()),
    };
    Ok(state.create_task(&name, &agent_type, config_value).await)
}

/// Update agent task status
#[tauri::command]
pub async fn agent_update_task(
    id: String,
    status: String,
    progress: u8,
    output: Option<String>,
    state: State<'_, AgentManager>
) -> Result<(), String> {
    let agent_status = match status.as_str() {
        "running" => AgentStatus::Running,
        "completed" => AgentStatus::Completed,
        "failed" => AgentStatus::Failed,
        _ => AgentStatus::Pending,
    };
    state.update_task_status(&id, agent_status, progress, output).await;
    Ok(())
}

/// List agent configurations
#[tauri::command]
pub async fn agent_list_configs(
    state: State<'_, AgentManager>
) -> Result<Vec<AgentConfig>, String> {
    Ok(state.list_configs().await)
}

/// Add an agent configuration
#[tauri::command]
pub async fn agent_add_config(
    config: String,
    state: State<'_, AgentManager>
) -> Result<(), String> {
    let config: AgentConfig = match serde_json::from_str(&config) {
        Ok(v) => v,
        Err(e) => return Err(e.to_string()),
    };
    state.add_config(config).await;
    Ok(())
}

/// Remove an agent configuration
#[tauri::command]
pub async fn agent_remove_config(
    id: String,
    state: State<'_, AgentManager>
) -> Result<(), String> {
    state.remove_config(&id).await;
    Ok(())
}
