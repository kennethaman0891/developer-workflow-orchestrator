//! Security: Audit Logging
//!
//! Tamper-evident audit log for security-relevant events.
//! Uses append-only file with hash chaining for integrity.

use std::fs::OpenOptions;
use std::io::{Write, BufWriter};
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};
use serde::{Deserialize, Serialize};
use sha2::{Sha256, Digest};

/// Security event types
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum AuditEventType {
    // Authentication
    LoginSuccess,
    LoginFailure,
    RegisterSuccess,
    RegisterFailure,
    Logout,
    PasswordChange,
    EmailVerification,

    // Authorization
    PermissionGranted,
    PermissionDenied,
    RoleChanged,

    // File System
    FileRead,
    FileWrite,
    FileCreate,
    FileDelete,
    FileRename,
    DirectoryCreate,
    DirectoryDelete,
    PathTraversalBlocked,

    // License
    LicenseActivated,
    LicenseDeactivated,
    LicenseValidationFailure,

    // Terminal
    TerminalSpawned,
    TerminalClosed,
    CommandExecuted,

    // System
    AppStart,
    AppShutdown,
    ConfigChanged,
    SecurityConfigChanged,
}

/// Severity level for audit events
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, PartialOrd, Ord)]
#[serde(rename_all = "lowercase")]
pub enum Severity {
    Info,
    Warning,
    Critical,
}

/// Audit log entry
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuditEntry {
    pub timestamp: u64,           // Unix epoch ms
    pub event_type: AuditEventType,
    pub severity: Severity,
    pub user_id: Option<String>,  // User identifier if available
    pub session_id: Option<String>,
    pub resource: Option<String>, // File path, resource ID, etc.
    pub details: serde_json::Value, // Flexible event-specific data
    pub previous_hash: String,    // Hash of previous entry (chain)
    pub hash: String,             // Hash of this entry
}

/// Audit logger with hash-chained integrity
pub struct AuditLogger {
    file: Mutex<BufWriter<std::fs::File>>,
    last_hash: Mutex<String>,
    enabled: bool,
}

impl AuditLogger {
    /// Create a new audit logger.
    /// Log file is at ~/.config/dwo/audit.log
    pub fn new() -> Result<Self, String> {
        let log_path = Self::log_path();
        if let Some(parent) = log_path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }

        let file = OpenOptions::new()
            .create(true)
            .append(true)
            .open(&log_path)
            .map_err(|e| e.to_string())?;

        let writer = BufWriter::new(file);
        let last_hash = Self::read_last_hash(&log_path).unwrap_or_else(|| "0".repeat(64));

        Ok(Self {
            file: Mutex::new(writer),
            last_hash: Mutex::new(last_hash),
            enabled: true,
        })
    }

    fn log_path() -> PathBuf {
        dirs::config_dir()
            .map(|d| d.join("dwo").join("audit.log"))
            .unwrap_or_else(|| PathBuf::from("/tmp/dwo-audit.log"))
    }

    fn read_last_hash(path: &PathBuf) -> Option<String> {
        use std::io::{BufRead, BufReader};
        let file = std::fs::File::open(path).ok()?;
        let reader = BufReader::new(file);
        let mut last_line = String::new();
        for line in reader.lines() {
            if let Ok(l) = line {
                last_line = l;
            }
        }
        if last_line.is_empty() {
            return None;
        }
        // Parse last line as JSON and extract hash
        if let Ok(entry) = serde_json::from_str::<AuditEntry>(&last_line) {
            Some(entry.hash)
        } else {
            None
        }
    }

    /// Log an audit event
    pub fn log(
        &self,
        event_type: AuditEventType,
        severity: Severity,
        user_id: Option<String>,
        session_id: Option<String>,
        resource: Option<String>,
        details: serde_json::Value,
    ) {
        if !self.enabled {
            return;
        }

        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);

        let previous_hash = self.last_hash.lock().unwrap().clone();

        let entry = AuditEntry {
            timestamp,
            event_type,
            severity,
            user_id,
            session_id,
            resource,
            details,
            previous_hash: previous_hash.clone(),
            hash: String::new(), // Will compute below
        };

        // Compute hash of entry (excluding hash field itself)
        let mut hasher = Sha256::new();
        let entry_for_hash = serde_json::json!({
            "timestamp": entry.timestamp,
            "event_type": entry.event_type,
            "severity": entry.severity,
            "user_id": entry.user_id,
            "session_id": entry.session_id,
            "resource": entry.resource,
            "details": entry.details,
            "previous_hash": entry.previous_hash,
        });
        hasher.update(serde_json::to_vec(&entry_for_hash).unwrap_or_default());
        let hash = format!("{:x}", hasher.finalize());

        let mut entry = entry;
        entry.hash = hash.clone();

        // Write to file
        if let Ok(mut writer) = self.file.lock() {
            let line = serde_json::to_string(&entry).unwrap_or_default();
            let _ = writeln!(writer, "{}", line);
            let _ = writer.flush();
        }

        // Update last hash
        *self.last_hash.lock().unwrap() = hash;
    }

    /// Enable/disable audit logging
    pub fn set_enabled(&mut self, enabled: bool) {
        self.enabled = enabled;
    }

    /// Verify the integrity of the audit log
    pub fn verify_integrity(&self) -> Result<bool, String> {
        use std::io::{BufRead, BufReader};
        let path = Self::log_path();
        let file = std::fs::File::open(&path).map_err(|e| e.to_string())?;
        let reader = BufReader::new(file);

        let mut prev_hash = "0".repeat(64);
        for (line_num, line) in reader.lines().enumerate() {
            let line = line.map_err(|e| e.to_string())?;
            if line.trim().is_empty() {
                continue;
            }
            let entry: AuditEntry = serde_json::from_str(&line)
                .map_err(|e| format!("Line {}: invalid JSON: {}", line_num + 1, e))?;

            // Verify chain
            if entry.previous_hash != prev_hash {
                return Ok(false);
            }

            // Verify hash
            let mut hasher = Sha256::new();
            let entry_for_hash = serde_json::json!({
                "timestamp": entry.timestamp,
                "event_type": entry.event_type,
                "severity": entry.severity,
                "user_id": entry.user_id,
                "session_id": entry.session_id,
                "resource": entry.resource,
                "details": entry.details,
                "previous_hash": entry.previous_hash,
            });
            hasher.update(serde_json::to_vec(&entry_for_hash).unwrap_or_default());
            let computed_hash = format!("{:x}", hasher.finalize());

            if computed_hash != entry.hash {
                return Ok(false);
            }

            prev_hash = entry.hash;
        }

        Ok(true)
    }
}

/// Global audit logger instance
static AUDIT_LOGGER: OnceLock<AuditLogger> = OnceLock::new();

/// Initialize the global audit logger
pub fn init_audit_logger() -> Result<(), String> {
    let logger = AuditLogger::new()?;
    AUDIT_LOGGER.set(logger).map_err(|_| "Audit logger already initialized".to_string())
}

/// Get the global audit logger
pub fn audit_logger() -> Option<&'static AuditLogger> {
    AUDIT_LOGGER.get()
}



use std::sync::OnceLock;
