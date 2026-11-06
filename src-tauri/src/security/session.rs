//! Security: Session Management
//!
//! Secure session handling with expiration, rotation, and invalidation.

use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// Session data
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Session {
    pub id: String,
    pub user_id: String,
    pub created_at: u64,      // Unix epoch ms
    pub last_activity: u64,   // Unix epoch ms
    pub expires_at: u64,      // Unix epoch ms
    pub ip_address: Option<String>,
    pub user_agent: Option<String>,
    pub metadata: serde_json::Value,
}

/// Session manager with automatic cleanup
pub struct SessionManager {
    sessions: Mutex<HashMap<String, Session>>,
    user_sessions: Mutex<HashMap<String, Vec<String>>>, // user_id -> session_ids
    default_ttl: Duration,
    max_sessions_per_user: usize,
}

impl SessionManager {
    pub fn new(default_ttl_hours: u64, max_sessions_per_user: usize) -> Self {
        Self {
            sessions: Mutex::new(HashMap::new()),
            user_sessions: Mutex::new(HashMap::new()),
            default_ttl: Duration::from_secs(default_ttl_hours * 3600),
            max_sessions_per_user,
        }
    }

    /// Create a new session
    pub fn create_session(
        &self,
        user_id: &str,
        ip_address: Option<String>,
        user_agent: Option<String>,
        metadata: serde_json::Value,
    ) -> Session {
        let now = current_time_ms();
        let session = Session {
            id: Uuid::new_v4().to_string(),
            user_id: user_id.to_string(),
            created_at: now,
            last_activity: now,
            expires_at: now + self.default_ttl.as_millis() as u64,
            ip_address,
            user_agent,
            metadata,
        };

        // Store session
        self.sessions.lock().unwrap().insert(session.id.clone(), session.clone());

        // Track user sessions
        let mut user_sessions = self.user_sessions.lock().unwrap();
        let sessions = user_sessions.entry(user_id.to_string()).or_default();
        sessions.push(session.id.clone());

        // Enforce max sessions per user
        if sessions.len() > self.max_sessions_per_user {
            // Remove oldest session
            if let Some(oldest_id) = sessions.first().cloned() {
                self.invalidate_session(&oldest_id);
                sessions.remove(0);
            }
        }

        session
    }

    /// Get session by ID
    pub fn get_session(&self, session_id: &str) -> Option<Session> {
        let mut sessions = self.sessions.lock().unwrap();
        if let Some(session) = sessions.get(session_id) {
            // Check expiration
            if session.expires_at < current_time_ms() {
                sessions.remove(session_id);
                return None;
            }
            // Update last activity
            let mut session = session.clone();
            session.last_activity = current_time_ms();
            sessions.insert(session_id.to_string(), session.clone());
            Some(session)
        } else {
            None
        }
    }

    /// Validate and refresh session
    pub fn validate_session(&self, session_id: &str) -> Result<Session, String> {
        let mut sessions = self.sessions.lock().unwrap();
        let session = sessions.get_mut(session_id).ok_or("Session not found")?;

        if session.expires_at < current_time_ms() {
            sessions.remove(session_id);
            return Err("Session expired".to_string());
        }

        session.last_activity = current_time_ms();
        Ok(session.clone())
    }

    /// Invalidate a session
    pub fn invalidate_session(&self, session_id: &str) {
        if let Some(session) = self.sessions.lock().unwrap().remove(session_id) {
            // Remove from user sessions
            let mut user_sessions = self.user_sessions.lock().unwrap();
            if let Some(sessions) = user_sessions.get_mut(&session.user_id) {
                sessions.retain(|id| id != session_id);
            }
        }
    }

    /// Invalidate all sessions for a user
    pub fn invalidate_user_sessions(&self, user_id: &str) {
        let session_ids: Vec<String> = {
            let user_sessions = self.user_sessions.lock().unwrap();
            user_sessions.get(user_id).cloned().unwrap_or_default()
        };

        for id in session_ids {
            self.invalidate_session(&id);
        }
    }

    /// Extend session expiration
    pub fn extend_session(&self, session_id: &str, additional: Duration) -> Result<(), String> {
        let mut sessions = self.sessions.lock().unwrap();
        let session = sessions.get_mut(session_id).ok_or("Session not found")?;
        session.expires_at += additional.as_millis() as u64;
        Ok(())
    }

    /// Get all active sessions for a user
    pub fn get_user_sessions(&self, user_id: &str) -> Vec<Session> {
        let session_ids: Vec<String> = {
            let user_sessions = self.user_sessions.lock().unwrap();
            user_sessions.get(user_id).cloned().unwrap_or_default()
        };

        let sessions = self.sessions.lock().unwrap();
        let now = current_time_ms();

        session_ids
            .into_iter()
            .filter_map(|id| sessions.get(&id))
            .filter(|s| s.expires_at >= now)
            .cloned()
            .collect()
    }

    /// Clean up expired sessions (call periodically)
    pub fn cleanup(&self) {
        let now = current_time_ms();
        let mut sessions = self.sessions.lock().unwrap();
        let mut user_sessions = self.user_sessions.lock().unwrap();

        let expired_ids: Vec<String> = sessions
            .iter()
            .filter(|(_, s)| s.expires_at < now)
            .map(|(id, _)| id.clone())
            .collect();

        for id in expired_ids {
            if let Some(session) = sessions.remove(&id) {
                if let Some(user_sess) = user_sessions.get_mut(&session.user_id) {
                    user_sess.retain(|s| s != &id);
                }
            }
        }

        // Clean up empty user entries
        user_sessions.retain(|_, sessions| !sessions.is_empty());
    }

    /// Get session count stats
    pub fn stats(&self) -> SessionStats {
        let sessions = self.sessions.lock().unwrap();
        let user_sessions = self.user_sessions.lock().unwrap();
        let now = current_time_ms();

        let active = sessions.values().filter(|s| s.expires_at >= now).count();
        let expired = sessions.len() - active;

        SessionStats {
            total_sessions: sessions.len(),
            active_sessions: active,
            expired_sessions: expired,
            total_users: user_sessions.len(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionStats {
    pub total_sessions: usize,
    pub active_sessions: usize,
    pub expired_sessions: usize,
    pub total_users: usize,
}

fn current_time_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// Global session manager
static SESSION_MANAGER: OnceLock<SessionManager> = OnceLock::new();

pub fn init_session_manager(ttl_hours: u64, max_per_user: usize) -> &'static SessionManager {
    SESSION_MANAGER.get_or_init(|| SessionManager::new(ttl_hours, max_per_user))
}

pub fn session_manager() -> &'static SessionManager {
    init_session_manager(24, 10) // Default: 24h TTL, max 10 sessions per user
}

use std::sync::OnceLock;
