//! Tauri commands backing the language-server integration.
//!
//! The trio mirrors the transport contract implemented by
//! `src/lib/monaco/lspTransport.ts`:
//!
//! | command      | direction | payload                                            |
//! |--------------|-----------|----------------------------------------------------|
//! | `lsp_start`  | UI → Rust | `(language, root_uri)` → `LspStartResult`          |
//! | `lsp_write`  | UI → Rust | `(client_id, data)` — a bare JSON-RPC message       |
//! | `lsp_stop`   | UI → Rust | `(client_id)`                                      |
//! | `lsp-stdout` | Rust → UI | `{client_id, data}` — one framed message per event  |
//! | `lsp-exit`   | Rust → UI | `{client_id}` — server stopped / crashed / EOF      |
//!
//! A missing language-server binary is **not** an error: `lsp_start` returns
//! `Ok` with `available: false` and a human-readable `reason`, so the editor
//! can feature-detect and keep using Monaco's built-in workers.

use tauri::{AppHandle, Manager};

use super::manager::{LspManager, LspStartResult};

/// Resolve the shared manager, or report that the app never managed it.
fn manager(app: &AppHandle) -> Result<tauri::State<'_, LspManager>, String> {
    app.try_state::<LspManager>()
        .ok_or_else(|| "lsp manager is not initialised".to_string())
}

/// Start a language server for `language` under `root_uri`.
///
/// `root_uri` is a `file://` URI (a bare path is accepted too); the manager
/// walks up from it to the nearest project marker so the server is rooted at
/// the workspace rather than at one file's directory.
#[tauri::command]
pub async fn lsp_start(
    app: AppHandle,
    language: String,
    root_uri: String,
) -> Result<LspStartResult, String> {
    manager(&app)?.start(&language, &root_uri)
}

/// Write one JSON-RPC message to a running server.
///
/// The Rust side owns `Content-Length` framing: `data` is the bare message.
#[tauri::command]
pub async fn lsp_write(
    app: AppHandle,
    client_id: String,
    data: String,
) -> Result<(), String> {
    manager(&app)?.write(&client_id, &data).await
}

/// Stop a server: closes stdin, aborts the relay tasks and kills the child.
///
/// Idempotent — stopping an unknown or already-stopped client succeeds.
#[tauri::command]
pub async fn lsp_stop(app: AppHandle, client_id: String) -> Result<(), String> {
    manager(&app)?.stop(&client_id).await
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The frontend (`src/lib/monaco/lspTransport.ts`) reads these exact keys;
    /// serde has no `rename_all` here, so the wire shape is snake_case — the
    /// same convention every other command result in this app uses.
    #[test]
    fn start_result_wire_shape_is_snake_case() {
        let unavailable = serde_json::to_value(LspStartResult {
            available: false,
            client_id: None,
            reason: "no 'typescript-language-server' binary found for 'typescript'".into(),
            root_uri: None,
        })
        .unwrap();

        assert_eq!(unavailable["available"], serde_json::json!(false));
        assert_eq!(unavailable["client_id"], serde_json::Value::Null);
        assert_eq!(unavailable["root_uri"], serde_json::Value::Null);
        assert!(unavailable["reason"].as_str().unwrap().contains("no '"));

        let available = serde_json::to_value(LspStartResult {
            available: true,
            client_id: Some("client-1".into()),
            reason: String::new(),
            root_uri: Some("file:///w".into()),
        })
        .unwrap();

        assert_eq!(available["available"], serde_json::json!(true));
        assert_eq!(available["client_id"], serde_json::json!("client-1"));
        assert_eq!(available["root_uri"], serde_json::json!("file:///w"));
    }

    /// Event payloads are addressed by `client_id` so several servers can run
    /// side by side without the UI mixing their streams.
    #[test]
    fn stdout_payload_carries_client_id_and_raw_message() {
        let json = serde_json::to_value(super::super::manager::LspStdoutPayload {
            client_id: "abc".into(),
            data: r#"{"jsonrpc":"2.0","id":1}"#.into(),
        })
        .unwrap();

        assert_eq!(json["client_id"], serde_json::json!("abc"));
        assert_eq!(json["data"], serde_json::json!(r#"{"jsonrpc":"2.0","id":1}"#));
    }
}
