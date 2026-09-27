//! Language Server Protocol support.
//!
//! Spawns language servers over stdio, relays their `Content-Length` framed
//! JSON-RPC traffic to the frontend over Tauri events, and guarantees the
//! children die with the app (or with the workspace that started them).
//!
//! * [`framing`] — the wire format: incremental frame reader + `encode_frame`.
//! * [`manager`] — server discovery, process lifecycle, event relay.
//! * [`commands`] — the `lsp_start` / `lsp_write` / `lsp_stop` commands.

pub mod commands;
pub mod framing;
pub mod manager;

pub use commands::{lsp_start, lsp_stop, lsp_write};
pub use manager::{LspManager, LspStartResult};
