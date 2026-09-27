//! Tauri commands that drive the file watcher.
//!
/// Both commands are idempotent: watching an already-watched root, or
/// unwatching an unknown one, succeeds without side effects.

use std::path::Path;

use tauri::{AppHandle, Manager};

use super::watcher::WatchManager;
use crate::lsp::LspManager;

/// Recursively watch `path`; every surviving change is re-emitted to the
/// frontend as a debounced `file-changed` event.
#[tauri::command]
pub async fn watch_path(app: AppHandle, path: String) -> Result<(), String> {
    app.state::<WatchManager>().watch(Path::new(&path))
}

/// Stop watching `path`, dropping its notify watcher and any queued events.
///
/// This is also the workspace-change hook: the IDE unwatches the previous root
/// whenever the workspace changes or the view unmounts, so every language
/// server rooted under it is stopped here too — a language server must never
/// outlive the workspace it was started for.
#[tauri::command]
pub async fn unwatch_path(app: AppHandle, path: String) -> Result<(), String> {
    app.state::<WatchManager>().unwatch(Path::new(&path))?;

    if let Some(lsp) = app.try_state::<LspManager>() {
        lsp.stop_overlapping(Path::new(&path)).await;
    }
    Ok(())
}
