//! Session handoff — package a terminal's scrollback and inject it into another.

pub mod types;
pub mod manager;
pub mod commands;

pub use types::{HandoffArtifact, SessionSummary};
pub use manager::HandoffManager;
