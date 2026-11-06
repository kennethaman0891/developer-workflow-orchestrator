//! Security Commands
//!
//! Tauri command handlers for security operations.

use crate::security::{audit, ratelimit, session, encrypted_storage};
use serde::{Deserialize, Serialize};
use tauri::State;

#[derive(Debug, Deserialize)]
pub struct AuditLogRequest {
    pub event_type: String,
    pub severity: String,
    pub user_id: Option<String>,
    pub session_id: Option<String>,
    pub resource: Option<String>,
    pub details: serde_json::Value,
}

/// Log an audit event
#[tauri::command]
pub async fn audit_log(request: AuditLogRequest) -> Result<(), String> {
    use crate::security::audit::{AuditEventType, Severity};

    let event_type = match request.event_type.as_str() {
        "login_success" => AuditEventType::LoginSuccess,
        "login_failure" => AuditEventType::LoginFailure,
        "register_success" => AuditEventType::RegisterSuccess,
        "register_failure" => AuditEventType::RegisterFailure,
        "logout" => AuditEventType::Logout,
        "password_change" => AuditEventType::PasswordChange,
        "email_verification" => AuditEventType::EmailVerification,
        "permission_granted" => AuditEventType::PermissionGranted,
        "permission_denied" => AuditEventType::PermissionDenied,
        "role_changed" => AuditEventType::RoleChanged,
        "file_read" => AuditEventType::FileRead,
        "file_write" => AuditEventType::FileWrite,
        "file_create" => AuditEventType::FileCreate,
        "file_delete" => AuditEventType::FileDelete,
        "file_rename" => AuditEventType::FileRename,
        "directory_create" => AuditEventType::DirectoryCreate,
        "directory_delete" => AuditEventType::DirectoryDelete,
        "path_traversal_blocked" => AuditEventType::PathTraversalBlocked,
        "license_activated" => AuditEventType::LicenseActivated,
        "license_deactivated" => AuditEventType::LicenseDeactivated,
        "license_validation_failure" => AuditEventType::LicenseValidationFailure,
        "terminal_spawned" => AuditEventType::TerminalSpawned,
        "terminal_closed" => AuditEventType::TerminalClosed,
        "command_executed" => AuditEventType::CommandExecuted,
        "app_start" => AuditEventType::AppStart,
        "app_shutdown" => AuditEventType::AppShutdown,
        "config_changed" => AuditEventType::ConfigChanged,
        "security_config_changed" => AuditEventType::SecurityConfigChanged,
        _ => return Err(format!("Unknown event type: {}", request.event_type)),
    };

    let severity = match request.severity.as_str() {
        "info" => Severity::Info,
        "warning" => Severity::Warning,
        "critical" => Severity::Critical,
        _ => return Err(format!("Unknown severity: {}", request.severity)),
    };

    if let Some(logger) = audit::audit_logger() {
        logger.log(
            event_type,
            severity,
            request.user_id,
            request.session_id,
            request.resource,
            request.details,
        );
    }

    Ok(())
}

/// Verify audit log integrity
#[tauri::command]
pub async fn audit_verify() -> Result<bool, String> {
    if let Some(logger) = audit::audit_logger() {
        logger.verify_integrity()
    } else {
        Err("Audit logger not initialized".to_string())
    }
}

#[derive(Debug, Deserialize)]
pub struct RateLimitRequest {
    pub identifier: String,
    pub operation: String, // "login", "register", "api"
}

/// Check rate limit
#[tauri::command]
pub async fn rate_limit_check(request: RateLimitRequest) -> Result<bool, String> {
    let limiter = ratelimit::rate_limiter();

    match request.operation.as_str() {
        "login" => limiter.check_login(&request.identifier).map(|_| true),
        "register" => limiter.check_register(&request.identifier).map(|_| true),
        "api" => limiter.check_api(&request.identifier).map(|_| true),
        _ => Err(format!("Unknown operation: {}", request.operation)),
    }
}

/// Reset rate limit (e.g., after successful login)
#[tauri::command]
pub async fn rate_limit_reset(identifier: String, operation: String) -> Result<(), String> {
    let limiter = ratelimit::rate_limiter();

    match operation.as_str() {
        "login" => {
            limiter.reset_login(&identifier);
            Ok(())
        }
        _ => Err(format!("Unknown operation: {}", operation)),
    }
}

#[derive(Debug, Deserialize)]
pub struct SessionCreateRequest {
    pub user_id: String,
    pub ip_address: Option<String>,
    pub user_agent: Option<String>,
    pub metadata: Option<serde_json::Value>,
}

/// Create a new session
#[tauri::command]
pub async fn session_create(request: SessionCreateRequest) -> Result<session::Session, String> {
    let manager = session::session_manager();
    let session = manager.create_session(
        &request.user_id,
        request.ip_address,
        request.user_agent,
        request.metadata.unwrap_or_default(),
    );
    Ok(session)
}

#[derive(Debug, Deserialize)]
pub struct SessionValidateRequest {
    pub session_id: String,
}

/// Validate a session
#[tauri::command]
pub async fn session_validate(request: SessionValidateRequest) -> Result<session::Session, String> {
    let manager = session::session_manager();
    manager.validate_session(&request.session_id)
}

/// Invalidate a session
#[tauri::command]
pub async fn session_invalidate(session_id: String) -> Result<(), String> {
    let manager = session::session_manager();
    manager.invalidate_session(&session_id);
    Ok(())
}

/// Get session statistics
#[tauri::command]
pub async fn session_stats() -> Result<session::SessionStats, String> {
    let manager = session::session_manager();
    Ok(manager.stats())
}

#[derive(Debug, Deserialize)]
pub struct EncryptRequest {
    pub data: serde_json::Value,
}

/// Encrypt data
#[tauri::command]
pub async fn encrypt_data(request: EncryptRequest) -> Result<encrypted_storage::EncryptedData, String> {
    encrypted_storage::encrypt_json(&request.data)
}

#[derive(Debug, Deserialize)]
pub struct DecryptRequest {
    pub nonce: String,
    pub ciphertext: String,
}

/// Decrypt data
#[tauri::command]
pub async fn decrypt_data(request: DecryptRequest) -> Result<serde_json::Value, String> {
    let data = encrypted_storage::EncryptedData {
        nonce: request.nonce,
        ciphertext: request.ciphertext,
    };
    encrypted_storage::decrypt_json(&data)
}
