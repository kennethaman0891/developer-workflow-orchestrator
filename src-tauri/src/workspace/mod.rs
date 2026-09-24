//! Workspace Module
//!
//! Workspace ↔ session index for terminal persistence across restarts.

pub mod index;
pub mod commands;

pub use index::WorkspaceIndex;
