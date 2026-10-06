//! Language-server process management.
//!
//! Each `lsp_start` spawns one language server as a stdio child process and
//! relays its `Content-Length` framed JSON-RPC traffic to the frontend over
//! Tauri events, addressed by a `client_id`:
//!
//! ```text
//!  frontend                     tauri state                      child
//!  ─────────                    ───────────                      ─────
//!  lsp_start(language, root) ─▶ LspManager::start ── spawn ──▶  <language server>
//!                               └ emit "lsp-stdout" ◀── stdout ──┘
//!  lsp_write(client_id, msg) ─▶ LspManager::write ── stdin ───▶
//!  lsp_stop(client_id) ───────▶ LspManager::stop ── kill ─────▶
//! ```
//!
//! Design notes:
//!
//! * **A missing binary is not an error.** `lsp_start` returns
//!   `Ok(LspStartResult { available: false, …, reason })` so the editor can
//!   feature-detect and fall back to Monaco's built-in workers. Only genuine
//!   command failures (no managed state, write to a dead pipe) are `Err`.
//! * **Nothing outlives the app.** Every child is `kill_on_drop`, reader tasks
//!   are aborted on stop, and [`Drop`] kills whatever is left at exit — the
//!   same lifecycle the file watcher already follows.
//! * **The reader owns framing.** Child stdout is buffered until a complete
//!   frame arrives ([`super::framing::FrameReader`]) and only the JSON body is
//!   emitted, so the frontend never sees `Content-Length` headers.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::Arc;

use parking_lot::Mutex;
use serde::Serialize;
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, ChildStderr, ChildStdout, Command};
use tokio::task::JoinHandle;
use uuid::Uuid;

use super::framing::{encode_frame, FrameReader};

/// Event carrying one decoded JSON-RPC message from the server.
///
/// Payload: `{"client_id": "<uuid>", "data": "<json-rpc message>"}` — the raw
/// frame *body*, header already stripped by the reader task.
pub const EVENT_STDOUT: &str = "lsp-stdout";

/// Event carrying the server's exit (stopped, crashed or EOF).
///
/// Payload: `{"client_id": "<uuid>"}`. Emitted both by the reader task on EOF
/// and by [`LspManager::stop`], so listeners must be idempotent.
pub const EVENT_EXIT: &str = "lsp-exit";

/// Result of [`LspManager::start`] — the shape `lsp_start` returns to the UI.
///
/// `available: false` is a **success**: the server simply is not installed.
#[derive(Debug, Clone, Serialize)]
pub struct LspStartResult {
    /// Whether a language server process is now running for this language.
    pub available: bool,
    /// Handle for `lsp_write` / `lsp_stop`; `None` when unavailable.
    pub client_id: Option<String>,
    /// Why the server is unavailable (`String::new()` when it is running).
    pub reason: String,
    /// `file://` URI of the resolved workspace root the server was started in,
    /// or `None` when unavailable. The client sends this as `rootUri` during
    /// the `initialize` handshake.
    pub root_uri: Option<String>,
}

impl LspStartResult {
    fn unavailable(reason: String) -> Self {
        Self {
            available: false,
            client_id: None,
            reason,
            root_uri: None,
        }
    }
}

/// Payload of [`EVENT_STDOUT`].
#[derive(Debug, Clone, Serialize)]
pub struct LspStdoutPayload {
    pub client_id: String,
    pub data: String,
}

/// Payload of [`EVENT_EXIT`].
#[derive(Debug, Clone, Serialize)]
pub struct LspExitPayload {
    pub client_id: String,
}

// ---------------------------------------------------------------------------
// Server discovery
// ---------------------------------------------------------------------------

/// One way of launching a language server.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ServerCandidate {
    /// Executable name (looked up on `PATH`) or absolute path.
    pub program: String,
    /// Arguments; `--stdio` for servers that do not default to stdio.
    pub args: Vec<String>,
    /// Whether the program may be resolved from the opened project's
    /// `node_modules/.bin` directory.
    ///
    /// Node-based servers are frequently installed per project, so for
    /// those candidates we prefer a project-local install. Every *other*
    /// server (rust-analyzer, gopls, clangd, ...) must come from `PATH`
    /// or an absolute path only: executing a `node_modules/.bin` shim of an
    /// arbitrary name out of a user-opened project would let a malicious
    /// project plant a script under a native server's name and have it
    /// spawned by DWO.
    pub local_bin_eligible: bool,
}

impl ServerCandidate {
    pub fn new(program: &str, args: &[&str]) -> Self {
        Self {
            program: program.to_string(),
            args: args.iter().map(|a| a.to_string()).collect(),
            local_bin_eligible: false,
        }
    }
}

fn node(program: &str, args: &[&str]) -> Vec<ServerCandidate> {
    vec![ServerCandidate {
        local_bin_eligible: true,
        ..ServerCandidate::new(program, args)
    }]
}

/// Map a Monaco language id to the language servers worth attempting, most
/// preferred first.
///
/// Every entry is spawned with piped stdio and is expected to speak LSP over
/// stdin/stdout. An empty `Vec` means "no server configured for this
/// language", which the caller turns into `available: false`.
///
/// `typescript-language-server` is listed first because it is the reference
/// target for this integration — but note the editor deliberately does *not*
/// attach it for `.ts`/`.js` (Monaco's built-in TypeScript worker already
/// serves those languages; see the architectural note in
/// `src/lib/monaco/lspTransport.ts`).
pub fn candidates_for_language(language: &str) -> Vec<ServerCandidate> {
    let lang = language.trim().to_ascii_lowercase();
    match lang.as_str() {
        // TypeScript / JavaScript (node-based, `--stdio` required).
        "typescript" | "javascript" | "typescriptreact" | "javascriptreact" | "ts" | "js"
        | "tsx" | "jsx" => node("typescript-language-server", &["--stdio"]),

        // Rust ships a stdio language server inside the toolchain.
        "rust" => vec![ServerCandidate::new("rust-analyzer", &[])],

        "python" => vec![
            ServerCandidate::new("pyright-langserver", &["--stdio"]),
            ServerCandidate::new("jedi-language-server", &[]),
        ],
        "go" => vec![ServerCandidate::new("gopls", &[])],
        "c" | "cpp" | "objective-c" | "objective-cpp" => {
            vec![ServerCandidate::new("clangd", &[])]
        }
        "php" => vec![
            ServerCandidate::new("intelephense", &["--stdio"]),
            ServerCandidate::new("phpactor", &["language-server"]),
        ],
        "ruby" => vec![ServerCandidate::new("solargraph", &["stdio"])],
        "yaml" => node("yaml-language-server", &["--stdio"]),
        "shell" | "shellscript" | "sh" | "bash" | "zsh" => {
            node("bash-language-server", &["start"])
        }
        "css" | "scss" | "less" => node("vscode-css-language-server", &["--stdio"]),
        "html" | "handlebars" => node("vscode-html-language-server", &["--stdio"]),
        "json" => node("vscode-json-language-server", &["--stdio"]),
        "lua" => vec![ServerCandidate::new("lua-language-server", &[])],
        "dart" => vec![ServerCandidate::new("dart", &["language-server"])],
        "swift" => vec![ServerCandidate::new("sourcekit-lsp", &[])],
        _ => Vec::new(),
    }
}

/// Ordered concrete executables to try for a candidate: a project-local
/// `node_modules/.bin` shim first (node servers are frequently installed per
/// project), then the `PATH` lookup.
///
/// The project-local lookup is only attempted for node-based candidates
/// (`local_bin_eligible`); for everything else the binary must resolve via
/// `PATH` (or be an absolute path), so a hostile project can't shadow a
/// native server with a planted `node_modules/.bin` script.
fn executable_variants(cwd: &Path, candidate: &ServerCandidate) -> Vec<ServerCandidate> {
    let mut out = Vec::new();
    if candidate.local_bin_eligible && !candidate.program.contains(std::path::MAIN_SEPARATOR) {
        let local = cwd
            .join("node_modules")
            .join(".bin")
            .join(&candidate.program);
        if local.exists() {
            out.push(ServerCandidate {
                program: local.to_string_lossy().into_owned(),
                args: candidate.args.clone(),
                local_bin_eligible: candidate.local_bin_eligible,
            });
        }
    }
    out.push(candidate.clone());
    out
}

/// Spawn the first candidate that actually starts.
///
/// `NotFound` for one candidate is normal (the binary is simply not installed)
/// and falls through to the next. Returns `None` when every candidate failed.
fn spawn_first(candidates: &[ServerCandidate], cwd: &Path) -> Option<(Child, ServerCandidate)> {
    for candidate in candidates {
        for variant in executable_variants(cwd, candidate) {
            let attempt = Command::new(&variant.program)
                .args(&variant.args)
                .current_dir(cwd)
                .stdin(Stdio::piped())
                .stdout(Stdio::piped())
                .stderr(Stdio::piped())
                .kill_on_drop(true)
                .spawn();

            match attempt {
                Ok(child) => return Some((child, variant)),
                Err(err) => log::debug!(
                    "[lsp] could not spawn {} {:?} in {}: {}",
                    variant.program,
                    variant.args,
                    cwd.display(),
                    err
                ),
            }
        }
    }
    None
}

// ---------------------------------------------------------------------------
// Paths & workspace roots
// ---------------------------------------------------------------------------

const WORKSPACE_MARKERS: &[&str] = &[
    ".git",
    ".hg",
    ".svn",
    "Cargo.toml",
    "go.mod",
    "package.json",
    "pyproject.toml",
    "setup.py",
    "composer.json",
    "Gemfile",
];

/// Walk up from `start` looking for a project marker, so a language server is
/// launched at the workspace root rather than at a single file's directory.
///
/// Falls back to the starting directory when nothing is found.
pub fn resolve_workspace_root(start: &Path) -> PathBuf {
    let start = if start.as_os_str().is_empty() {
        std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."))
    } else if start.is_dir() {
        start.to_path_buf()
    } else {
        start.parent().map(Path::to_path_buf).unwrap_or_else(|| start.to_path_buf())
    };

    let mut candidate = start.clone();
    for _ in 0..32 {
        if WORKSPACE_MARKERS.iter().any(|m| candidate.join(m).exists()) {
            return candidate;
        }
        match candidate.parent() {
            Some(parent) => candidate = parent.to_path_buf(),
            None => break,
        }
    }
    start
}

fn hex_value(byte: u8) -> Option<u8> {
    match byte {
        b'0'..=b'9' => Some(byte - b'0'),
        b'a'..=b'f' => Some(byte - b'a' + 10),
        b'A'..=b'F' => Some(byte - b'A' + 10),
        _ => None,
    }
}

/// Percent-decode a `file://` URI body. Byte-wise, so multi-byte UTF-8 never
/// hits a char-boundary panic.
fn percent_decode(input: &str) -> String {
    let bytes = input.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let (Some(hi), Some(lo)) = (hex_value(bytes[i + 1]), hex_value(bytes[i + 2])) {
                out.push(hi * 16 + lo);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

/// Percent-encode a filesystem path for use in a `file://` URI.
///
/// Keeps only RFC 3986 unreserved characters plus `/` and `:` (drive letters);
/// everything else — spaces, `#`, non-ASCII — becomes `%XX` over its UTF-8
/// bytes.
fn percent_encode_path(input: &str) -> String {
    const SAFE: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~/:@";
    let mut out = String::with_capacity(input.len());
    for byte in input.bytes() {
        if SAFE.contains(&byte) {
            out.push(byte as char);
        } else {
            out.push_str(&format!("%{byte:02X}"));
        }
    }
    out
}

/// Encode a filesystem path as a `file://` URI (`file:///Users/me/project`).
pub fn path_to_uri(path: &Path) -> String {
    let raw = path.to_string_lossy();
    let encoded = percent_encode_path(&raw);
    let bytes = raw.as_bytes();
    // `C:\…` / `C:/…` must not gain an extra slash: `file:///C:/…`.
    if bytes.len() >= 2 && bytes[0].is_ascii_alphabetic() && bytes[1] == b':' {
        format!("file:///{encoded}")
    } else {
        format!("file://{encoded}")
    }
}

/// Turn a `root_uri` argument (or a bare path) into a filesystem path.
///
/// Only `file://` URIs are percent-decoded — decoding a plain path would
/// corrupt a legitimate `%` in a filename.
pub fn uri_to_path(uri: &str) -> PathBuf {
    let Some(rest) = uri.strip_prefix("file://") else {
        return PathBuf::from(uri);
    };
    let decoded = percent_decode(rest);
    let bytes = decoded.as_bytes();
    // `file:///C:/x` → `/C:/x`; drop the leading slash so Windows sees `C:/x`.
    if bytes.len() >= 3 && bytes[0] == b'/' && bytes[1].is_ascii_alphabetic() && bytes[2] == b':' {
        PathBuf::from(&decoded[1..])
    } else {
        PathBuf::from(decoded)
    }
}

// ---------------------------------------------------------------------------
// LspManager
// ---------------------------------------------------------------------------

/// One running language server.
struct RunningClient {
    /// Workspace root the server was started in (used to stop it when that
    /// workspace goes away).
    root: PathBuf,
    /// Monaco language id this client was started for.
    language: String,
    /// The child's stdin, behind an async mutex so `lsp_write` can be async
    /// while `Drop` stays sync.
    stdin: Arc<tokio::sync::Mutex<Option<tokio::process::ChildStdin>>>,
    child: Child,
    /// stdout reader + stderr drain tasks; aborted on stop.
    tasks: Vec<JoinHandle<()>>,
}

/// Shared registry of running language servers, managed as Tauri state.
///
/// [`Drop`] kills every remaining child so no language server outlives the app.
pub struct LspManager {
    app: AppHandle,
    clients: Mutex<HashMap<String, RunningClient>>,
}

impl LspManager {
    pub fn new(app: AppHandle) -> Self {
        Self {
            app,
            clients: Mutex::new(HashMap::new()),
        }
    }

    /// Start a language server for `language` under `root_uri`.
    ///
    /// Never fails because a server is missing: that is the ordinary case on a
    /// machine without language servers installed, and the caller needs to
    /// distinguish it from a real fault.
    pub fn start(&self, language: &str, root_uri: &str) -> Result<LspStartResult, String> {
        let candidates = candidates_for_language(language);
        if candidates.is_empty() {
            return Ok(LspStartResult::unavailable(format!(
                "no language server configured for '{language}'"
            )));
        }

        let start_dir = uri_to_path(root_uri);
        let root = resolve_workspace_root(&start_dir);

        let Some((mut child, used)) = spawn_first(&candidates, &root) else {
            let tried: Vec<String> = candidates
                .iter()
                .map(|c| c.program.clone())
                .collect();
            return Ok(LspStartResult::unavailable(format!(
                "no '{}' binary found for '{language}' (tried: {})",
                used_program_hint(&candidates),
                tried.join(", ")
            )));
        };

        let Some(stdout) = child.stdout.take() else {
            let _ = child.start_kill();
            return Err(format!("lsp: child for '{language}' has no stdout pipe"));
        };
        let stdin = child.stdin.take();
        let stderr = child.stderr.take();

        let client_id = Uuid::new_v4().to_string();
        let root_uri = path_to_uri(&root);
        let mut tasks = Vec::new();

        if let Some(stderr) = stderr {
            tasks.push(tokio::spawn(drain_stderr(client_id.clone(), stderr)));
        }
        tasks.push(tokio::spawn(relay_stdout(
            self.app.clone(),
            client_id.clone(),
            stdout,
        )));

        log::info!(
            "[lsp] started {} {:?} for {language} in {} as {client_id}",
            used.program,
            used.args,
            root.display()
        );

        self.clients.lock().insert(
            client_id.clone(),
            RunningClient {
                root,
                language: language.to_string(),
                stdin: Arc::new(tokio::sync::Mutex::new(stdin)),
                child,
                tasks,
            },
        );

        Ok(LspStartResult {
            available: true,
            client_id: Some(client_id),
            reason: String::new(),
            root_uri: Some(root_uri),
        })
    }

    /// Write one JSON-RPC message to a running server's stdin.
    ///
    /// `data` is the bare message; framing is applied here so the frontend
    /// never has to think about `Content-Length`.
    pub async fn write(&self, client_id: &str, data: &str) -> Result<(), String> {
        let stdin = {
            let clients = self.clients.lock();
            clients.get(client_id).map(|c| Arc::clone(&c.stdin))
        };
        let Some(stdin) = stdin else {
            return Err(format!("unknown lsp client: {client_id}"));
        };

        let frame = encode_frame(data);
        let mut guard = stdin.lock().await;
        let Some(pipe) = guard.as_mut() else {
            return Err(format!("lsp client '{client_id}' is stopped"));
        };

        pipe.write_all(frame.as_bytes())
            .await
            .map_err(|err| format!("lsp write to '{client_id}' failed: {err}"))?;
        pipe.flush()
            .await
            .map_err(|err| format!("lsp flush to '{client_id}' failed: {err}"))?;
        Ok(())
    }

    /// Stop a server: close stdin, abort the relay tasks and kill the child.
    ///
    /// Idempotent — an unknown (already stopped) id is a no-op, because
    /// teardown paths legitimately race each other.
    pub async fn stop(&self, client_id: &str) -> Result<(), String> {
        let Some(mut client) = self.clients.lock().remove(client_id) else {
            return Ok(());
        };

        log::info!("[lsp] stopping {client_id} ({})", client.language);

        // Closing stdin first lets well-behaved servers exit cleanly…
        *client.stdin.lock().await = None;
        // …we still tear the tasks down immediately so nothing is left running.
        for task in &client.tasks {
            task.abort();
        }
        let _ = client.child.start_kill();
        let _ = client.child.wait().await;

        let _ = self.app.emit(
            EVENT_EXIT,
            LspExitPayload {
                client_id: client_id.to_string(),
            },
        );
        Ok(())
    }

    /// Stop every client whose workspace root overlaps `path`.
    ///
    /// Called when a workspace is unwatched (the IDE unwatches the previous
    /// root whenever the workspace changes or the view unmounts), so language
    /// servers never outlive the workspace they were started for.
    pub async fn stop_overlapping(&self, path: &Path) {
        let ids: Vec<String> = {
            let clients = self.clients.lock();
            clients
                .iter()
                .filter(|(_, client)| client.root.starts_with(path) || path.starts_with(&client.root))
                .map(|(id, _)| id.clone())
                .collect()
        };
        for id in ids {
            let _ = self.stop(&id).await;
        }
    }

    /// Number of live servers (used by tests and diagnostics).
    pub fn client_count(&self) -> usize {
        self.clients.lock().len()
    }
}

/// Human-readable summary of what a failed discovery actually tried.
fn used_program_hint(candidates: &[ServerCandidate]) -> String {
    candidates
        .first()
        .map(|c| c.program.clone())
        .unwrap_or_else(|| "server".to_string())
}

impl Drop for LspManager {
    fn drop(&mut self) {
        for (client_id, mut client) in self.clients.lock().drain() {
            // Abort the relay tasks first so nothing emits during teardown…
            for task in &client.tasks {
                task.abort();
            }
            // …kill the child (kill_on_drop is the belt to this braces)…
            if let Err(err) = client.child.start_kill() {
                log::debug!("[lsp] shutdown kill of {client_id} failed: {err}");
            }
            // Dropping `client` closes stdin (unless an in-flight `lsp_write`
            // still holds an Arc clone — harmless: the child is already dead).
            drop(client);
            log::debug!("[lsp] dropped {client_id} on shutdown");
        }
    }
}

// ---------------------------------------------------------------------------
// Reader tasks
// ---------------------------------------------------------------------------

/// Buffer child stdout, decode frames, emit one event per JSON-RPC message.
///
/// Runs until EOF, a read error or task abort; always emits [`EVENT_EXIT`] on
/// the way out so the UI can mark the connection closed.
async fn relay_stdout(app: AppHandle, client_id: String, stdout: ChildStdout) {
    let mut stream = stdout;
    let mut reader = FrameReader::new();
    let mut buf = vec![0u8; 16 * 1024];

    'outer: loop {
        match stream.read(&mut buf).await {
            Ok(0) => break, // EOF: the server exited
            Ok(n) => {
                reader.push(&buf[..n]);
                while let Some(frame) = reader.next() {
                    match frame {
                        Ok(payload) => {
                            let data = String::from_utf8_lossy(&payload).into_owned();
                            let event = LspStdoutPayload {
                                client_id: client_id.clone(),
                                data,
                            };
                            if let Err(err) = app.emit(EVENT_STDOUT, event) {
                                log::warn!("[lsp] {client_id} emit failed: {err}");
                            }
                        }
                        Err(err) => log::warn!("[lsp] {client_id} framing error: {err}"),
                    }
                }
            }
            Err(err) => {
                log::warn!("[lsp] {client_id} stdout read failed: {err}");
                break 'outer;
            }
        }
    }

    if reader.buffered() > 0 {
        log::warn!(
            "[lsp] {client_id} exited with {} buffered bytes of an incomplete frame",
            reader.buffered()
        );
    }

    let _ = app.emit(
        EVENT_EXIT,
        LspExitPayload {
            client_id: client_id.clone(),
        },
    );
}

/// Language servers log verbosely on stderr (rust-analyzer in particular uses
/// it as its primary log channel). Drain it so the pipe never blocks the child.
async fn drain_stderr(client_id: String, stderr: ChildStderr) {
    let mut lines = BufReader::new(stderr).lines();
    while let Ok(Some(line)) = lines.next_line().await {
        log::debug!("[lsp:{client_id}] {line}");
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;

    /// Persistent framed reader over a child's stdout.
    ///
    /// Unlike a one-shot helper it keeps its buffer between calls, so two
    /// messages that arrive in a single `read()` are both delivered instead of
    /// the second being dropped on the floor.
    struct FrameStream {
        stdout: ChildStdout,
        reader: FrameReader,
        buf: Vec<u8>,
    }

    impl FrameStream {
        fn new(stdout: ChildStdout) -> Self {
            Self {
                stdout,
                reader: FrameReader::new(),
                buf: vec![0u8; 4096],
            }
        }

        /// Next complete frame, or `None` on EOF, read error or deadline.
        ///
        /// The deadline is absolute so a wedged server can never hang the
        /// suite; malformed frames are skipped rather than ending the read.
        async fn next_frame(&mut self, deadline: std::time::Instant) -> Option<Vec<u8>> {
            loop {
                match self.reader.next() {
                    Some(Ok(frame)) => return Some(frame),
                    Some(Err(err)) => {
                        eprintln!("[test] skipping malformed frame: {err}");
                        continue;
                    }
                    None => {}
                }

                let now = std::time::Instant::now();
                if now >= deadline {
                    return None;
                }
                let n = match tokio::time::timeout(deadline - now, self.stdout.read(&mut self.buf))
                    .await
                {
                    Ok(Ok(0)) => return None, // EOF
                    Ok(Ok(n)) => n,
                    Ok(Err(_)) | Err(_) => return None,
                };
                self.reader.push(&self.buf[..n]);
            }
        }
    }

    /// Write one framed message to the child's stdin.
    async fn write_frame(stdin: &mut tokio::process::ChildStdin, message: &str) {
        stdin
            .write_all(encode_frame(message).as_bytes())
            .await
            .expect("write to child stdin");
        stdin.flush().await.expect("flush child stdin");
    }

    // ── discovery ──────────────────────────────────────────────────────────

    #[test]
    fn typescript_maps_to_typescript_language_server_stdio() {
        let candidates = candidates_for_language("typescript");
        assert_eq!(candidates.len(), 1);
        assert_eq!(candidates[0].program, "typescript-language-server");
        assert_eq!(candidates[0].args, vec!["--stdio".to_string()]);
        // Aliases the editor may send resolve to the same server.
        assert_eq!(candidates_for_language("javascriptreact"), candidates);
    }

    #[test]
    fn unknown_languages_have_no_candidates() {
        assert!(candidates_for_language("brainfuck").is_empty());
        assert!(candidates_for_language("").is_empty());
    }

    #[test]
    fn language_matching_is_case_insensitive() {
        assert_eq!(candidates_for_language("Rust"), candidates_for_language("rust"));
        assert_eq!(
            candidates_for_language("  TypeScript "),
            candidates_for_language("typescript")
        );
    }

    // ── paths ──────────────────────────────────────────────────────────────

    #[test]
    fn file_uri_round_trips() {
        let path = Path::new("/Users/me/my project/src");
        let uri = path_to_uri(path);
        assert_eq!(uri, "file:///Users/me/my%20project/src");
        assert_eq!(uri_to_path(&uri), path);
    }

    #[test]
    fn plain_paths_are_taken_verbatim() {
        assert_eq!(uri_to_path("/plain/path"), PathBuf::from("/plain/path"));
        // A literal `%` in a bare path must survive (no decoding without a scheme).
        assert_eq!(uri_to_path("/100%/raw"), PathBuf::from("/100%/raw"));
    }

    #[test]
    fn windows_drive_uri_loses_only_the_extra_slash() {
        assert_eq!(path_to_uri(Path::new("C:/code")), "file:///C:/code");
        assert_eq!(uri_to_path("file:///C:/code"), PathBuf::from("C:/code"));
    }

    #[test]
    fn non_ascii_paths_are_percent_encoded() {
        let path = Path::new("/proj/日本語");
        let uri = path_to_uri(path);
        assert!(uri.starts_with("file:///proj/%E6%97%A5"));
        assert_eq!(uri_to_path(&uri), path);
    }

    // ── workspace roots ────────────────────────────────────────────────────

    #[test]
    fn workspace_root_walks_up_to_the_nearest_marker() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        std::fs::create_dir_all(root.join("src-tauri/src/lsp")).unwrap();
        std::fs::write(root.join("Cargo.toml"), "[package]\n").unwrap();
        std::fs::write(root.join(".git"), "").unwrap();

        let nested = root.join("src-tauri/src/lsp");
        assert_eq!(resolve_workspace_root(&nested), root);
        assert_eq!(resolve_workspace_root(root), root);
    }

    #[test]
    fn workspace_root_falls_back_to_the_start_directory() {
        let dir = tempfile::tempdir().unwrap();
        let nested = dir.path().join("a/b");
        std::fs::create_dir_all(&nested).unwrap();
        // tempdirs live under /var/folders/… which has no marker above it
        // *inside* the tempdir; the walk stops at the start dir when no marker
        // is found before the filesystem root.
        let resolved = resolve_workspace_root(&nested);
        assert!(resolved.exists());
        assert!(nested.starts_with(&resolved) || resolved == nested);
    }

    #[test]
    fn workspace_root_accepts_a_file_path() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("main.rs"), "").unwrap();
        assert_eq!(
            resolve_workspace_root(&dir.path().join("main.rs")),
            dir.path()
        );
    }

    // ── real process I/O ───────────────────────────────────────────────────

    /// Hermetic end-to-end check of the stdio plumbing: `cat` echoes whatever
    /// we frame-write, so the exact message must come back through the reader.
    #[tokio::test]
    async fn stdio_round_trip_through_a_spawned_process() {
        let dir = tempfile::tempdir().unwrap();
        let candidates = vec![ServerCandidate::new("/bin/cat", &[])];
        let (mut child, used) =
            spawn_first(&candidates, dir.path()).expect("/bin/cat should be spawnable");
        assert_eq!(used.program, "/bin/cat");

        let mut stdin = child.stdin.take().expect("piped stdin");
        let mut stream = FrameStream::new(child.stdout.take().expect("piped stdout"));

        let message = r#"{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}"#;
        write_frame(&mut stdin, message).await;

        let echoed = stream
            .next_frame(std::time::Instant::now() + Duration::from_secs(5))
            .await
            .expect("cat should echo the frame back");
        assert_eq!(String::from_utf8_lossy(&echoed), message);

        drop(stdin); // EOF → cat exits
        let _ = child.wait().await;
    }

    /// Split writes behave identically: feeding the child stdin in pieces must
    /// still produce one intact frame.
    #[tokio::test]
    async fn partial_writes_still_produce_one_frame() {
        let dir = tempfile::tempdir().unwrap();
        let candidates = vec![ServerCandidate::new("/bin/cat", &[])];
        let (mut child, _) = spawn_first(&candidates, dir.path()).expect("spawn cat");

        let mut stdin = child.stdin.take().expect("piped stdin");
        let mut stream = FrameStream::new(child.stdout.take().expect("piped stdout"));

        let frame = encode_frame(r#"{"id":42,"result":null}"#);
        let (head, tail) = frame.split_at(9);
        stdin.write_all(head.as_bytes()).await.unwrap();
        tokio::time::sleep(Duration::from_millis(20)).await;
        stdin.write_all(tail.as_bytes()).await.unwrap();
        stdin.flush().await.unwrap();

        let echoed = stream
            .next_frame(std::time::Instant::now() + Duration::from_secs(5))
            .await
            .expect("echoed frame");
        assert_eq!(
            String::from_utf8_lossy(&echoed),
            r#"{"id":42,"result":null}"#
        );

        drop(stdin);
        let _ = child.wait().await;
    }

    /// Real language server, when one is installed: run the actual `initialize`
    /// handshake over stdio. Skips (with a message) when `rust-analyzer` is
    /// absent, because a missing binary is the normal condition this feature
    /// is designed to tolerate.
    #[tokio::test]
    async fn rust_analyzer_completes_the_initialize_handshake() {
        let probe = Command::new("rust-analyzer")
            .arg("--version")
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .await;
        if !matches!(probe, Ok(status) if status.success()) {
            eprintln!("rust-analyzer not on PATH — skipping handshake test");
            return;
        }

        let dir = tempfile::tempdir().unwrap();
        let (mut child, used) = spawn_first(&candidates_for_language("rust"), dir.path())
            .expect("rust-analyzer should spawn");
        assert_eq!(used.program, "rust-analyzer");

        let mut stdin = child.stdin.take().expect("piped stdin");
        let mut stream = FrameStream::new(child.stdout.take().expect("piped stdout"));

        let initialize = format!(
            r#"{{"jsonrpc":"2.0","id":1,"method":"initialize","params":{{"processId":null,"rootUri":{},"capabilities":{{}}}}}}"#,
            serde_json::to_string(&path_to_uri(dir.path())).unwrap()
        );
        write_frame(&mut stdin, &initialize).await;

        // Tolerate any notifications the server emits first (progress, log).
        let deadline = std::time::Instant::now() + Duration::from_secs(30);
        let mut response = None;
        while let Some(frame) = stream.next_frame(deadline).await {
            let value: serde_json::Value = match serde_json::from_slice(&frame) {
                Ok(value) => value,
                Err(_) => continue,
            };
            if value.get("id").and_then(|id| id.as_i64()) == Some(1) {
                response = Some(value);
                break;
            }
        }

        let response = response.expect("rust-analyzer must answer `initialize`");
        assert!(
            response.get("error").is_none(),
            "initialize returned an error: {response}"
        );
        assert!(
            response["result"]["capabilities"].is_object(),
            "initialize result must carry server capabilities: {response}"
        );

        // Shut down politely, then make sure a kill is enough to reap it.
        write_frame(
            &mut stdin,
            r#"{"jsonrpc":"2.0","id":2,"method":"shutdown","params":null}"#,
        )
        .await;
        let _ = child.start_kill();
        let _ = child.wait().await;
    }
}
