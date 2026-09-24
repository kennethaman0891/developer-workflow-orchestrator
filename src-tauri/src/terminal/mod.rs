//! Terminal Module
//!
//! Manages PTY terminal sessions, providing creation, attachment, and
//! lifecycle management for interactive terminal sessions.

pub mod manager;
pub mod session;
pub mod pty;
pub mod commands;

pub use manager::TerminalManager;
pub use session::{SessionMeta, TerminalSession};
