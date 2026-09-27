//! File watching: `notify` → debounced [`DwoEvent::FileChanged`] emissions.
//!
//! One [`notify::RecommendedWatcher`] is kept per watched root (recursive), and
//! each root gets its own [`IgnoreRules`] so skip decisions reuse the shared
//! rules from [`crate::fs::ignore`] instead of re-implementing them.
//!
//! Raw notify streams are extremely bursty — a single editor save can produce
//! create/modify/metadata triples and a `git checkout` hundreds — so every
//! event is funnelled through a [`Debouncer`]: writes sharing the same
//! `(path, action)` inside [`DEBOUNCE_WINDOW`] collapse into a single
//! emission, and a background flusher thread emits the survivors as
//! `file-changed` once the window closes.

use std::collections::hash_map::Entry;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::{Duration, Instant};

use notify::event::ModifyKind;
use notify::{
    Config as NotifyConfig, Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher,
};
use parking_lot::{Condvar, Mutex};
use tauri::{AppHandle, Emitter};

use super::events::DwoEvent;
use crate::fs::ignore::{self, IgnoreRules};

/// Debounce window: writes sharing a `(path, action)` key inside this span
/// collapse into one emitted `file-changed` event (last write wins).
pub const DEBOUNCE_WINDOW: Duration = Duration::from_millis(200);

/// Map a notify event kind onto the action string the frontend understands.
///
/// Returns `None` for kinds that describe no mutation the UI cares about
/// (plain reads, watch-meta events), so they never reach the debounce queue.
pub fn action_for_kind(kind: &EventKind) -> Option<&'static str> {
    match kind {
        EventKind::Create(_) => Some("created"),
        // Renames arrive as `Modify(Name(_))` — both `From`/`To`/`Both` and
        // the catch-all `RenameMode::Any` land here.
        EventKind::Modify(ModifyKind::Name(_)) => Some("renamed"),
        EventKind::Modify(_) => Some("modified"),
        EventKind::Remove(_) => Some("removed"),
        // `Any` is notify's "unclassified" default (imprecise backends such as
        // FSEvents); treating it as a modification keeps the UI fresh rather
        // than silently dropping a real change. Reads/meta-events are dropped.
        EventKind::Any => Some("modified"),
        EventKind::Access(_) | EventKind::Other => None,
    }
}

/// Editor/temp artifacts that must never surface as file changes: dotfiles
/// (`.swp`, `.DS_Store`, emacs `.#lock`), `#autosave#` locks and `backup~`
/// files. Backing these up would otherwise mark open tabs dirty on every
/// keystroke of an editor that writes them.
pub fn is_temp_artifact(name: &str) -> bool {
    name.starts_with('.')
        || name.starts_with('#')
        || name.ends_with('~')
        || name.ends_with(".swp")
        || name.ends_with(".swx")
}

/// Should a watcher event for `path` (reported under the watched `root`) be
/// dropped?
///
/// Reuses [`crate::fs::ignore`]:
/// * [`is_temp_artifact`] on the entry's own name,
/// * [`ignore::is_name_ignored`] on every component *below* the root (so a
///   workspace that happens to live under `dist/` is not poisoned by an
///   ignored name above it), and
/// * the root's cached `.gitignore` matcher ([`IgnoreRules`]), which also
///   rejects anything nested inside an ignored directory.
pub fn should_skip(root: &Path, path: &Path, rules: &IgnoreRules) -> bool {
    // The watched root itself is never a "change" worth reporting.
    if path == root {
        return true;
    }

    let name = match path.file_name() {
        Some(name) => name.to_string_lossy(),
        None => return true,
    };
    if is_temp_artifact(&name) {
        return true;
    }

    let rel = path.strip_prefix(root).unwrap_or(path);
    for component in rel.components() {
        let component = component.as_os_str().to_string_lossy();
        if ignore::is_name_ignored(&component) {
            return true;
        }
    }

    // Symlinks are never followed: a path that no longer exists (removals) or
    // is a symlink is treated as a non-directory, mirroring `is_ignored`.
    let is_dir = std::fs::symlink_metadata(path)
        .map(|m| m.is_dir())
        .unwrap_or(false);
    rules.is_ignored(rel, is_dir)
}

// ---------------------------------------------------------------------------
// Debounce queue
// ---------------------------------------------------------------------------

/// One queued emission, superseded by every later write of the same key.
#[derive(Debug, Clone, PartialEq, Eq)]
struct PendingEmission {
    /// Earliest moment this may be emitted (`last write + DEBOUNCE_WINDOW`).
    deadline: Instant,
    path: PathBuf,
    action: String,
}

/// Burst-collapsing queue keyed by `(path, action)`.
#[derive(Debug, Default)]
struct Debouncer {
    due: HashMap<(PathBuf, String), PendingEmission>,
    shutdown: bool,
}

impl Debouncer {
    /// Queue a change. The first write of a burst schedules a deadline, later
    /// writes overwrite the stored emission (**last write wins**) and push the
    /// deadline out by another window, so a burst becomes exactly one event.
    fn push(&mut self, path: PathBuf, action: &str, now: Instant) {
        let key = (path.clone(), action.to_string());
        let deadline = now + DEBOUNCE_WINDOW;
        match self.due.entry(key) {
            Entry::Occupied(mut slot) => {
                let pending = slot.get_mut();
                pending.deadline = deadline;
                pending.path = path;
                pending.action = action.to_string();
            }
            Entry::Vacant(slot) => {
                slot.insert(PendingEmission {
                    deadline,
                    path,
                    action: action.to_string(),
                });
            }
        }
    }

    /// Take every emission whose deadline has passed.
    fn take_due(&mut self, now: Instant) -> Vec<PendingEmission> {
        let expired: Vec<(PathBuf, String)> = self
            .due
            .iter()
            .filter(|(_, pending)| pending.deadline <= now)
            .map(|(key, _)| key.clone())
            .collect();
        expired
            .into_iter()
            .filter_map(|key| self.due.remove(&key))
            .collect()
    }

    /// Deadline of the soonest pending emission, if any.
    fn next_deadline(&self) -> Option<Instant> {
        self.due.values().map(|pending| pending.deadline).min()
    }

    /// Drop everything queued for `root` (used when a root is unwatched).
    fn clear_root(&mut self, root: &Path) {
        self.due.retain(|(path, _), _| !path.starts_with(root));
    }

    #[cfg(test)]
    fn len(&self) -> usize {
        self.due.len()
    }
}

// ---------------------------------------------------------------------------
// WatchManager
// ---------------------------------------------------------------------------

/// Shared between the notify callbacks, the flusher thread and the manager.
struct Inner {
    app: AppHandle,
    state: Mutex<Debouncer>,
    /// Woken whenever a new deadline is queued or shutdown is requested.
    wake: Condvar,
}

impl Inner {
    /// Queue a change for emission after [`DEBOUNCE_WINDOW`].
    fn push(&self, path: PathBuf, action: &str) {
        let mut state = self.state.lock();
        state.push(path, action, Instant::now());
        drop(state);
        self.wake.notify_all();
    }
}

/// Owns every [`RecommendedWatcher`] (keyed by watched root) and the debounce
/// queue that turns notify's bursts into single `file-changed` events.
///
/// Managed as Tauri state: [`Drop`] stops the flusher thread and unwatches
/// every root so no OS-level watch survives app teardown.
pub struct WatchManager {
    inner: Arc<Inner>,
    watchers: Mutex<HashMap<PathBuf, RecommendedWatcher>>,
    flusher: Option<std::thread::JoinHandle<()>>,
}

impl WatchManager {
    /// Create the manager and start the background flusher thread.
    pub fn new(app: AppHandle) -> Self {
        let inner = Arc::new(Inner {
            app,
            state: Mutex::new(Debouncer::default()),
            wake: Condvar::new(),
        });

        let flusher = {
            let inner = Arc::clone(&inner);
            std::thread::Builder::new()
                .name("dwo-file-watch-flush".into())
                .spawn(move || flush_loop(inner))
                .ok()
        };

        Self {
            inner,
            watchers: Mutex::new(HashMap::new()),
            flusher,
        }
    }

    /// Start recursively watching `root`. Idempotent: an already-watched root
    /// is left untouched.
    pub fn watch(&self, root: &Path) -> Result<(), String> {
        if !root.is_dir() {
            return Err(format!("not a directory: {}", root.display()));
        }
        let root = root.to_path_buf();

        let mut watchers = self.watchers.lock();
        if watchers.contains_key(&root) {
            return Ok(());
        }

        // Per-root `.gitignore` rules: loaded once and owned by the callback,
        // so every event for this root is filtered by the same matcher.
        let inner = Arc::clone(&self.inner);
        let cb_root = root.clone();
        let cb_rules = Arc::new(IgnoreRules::load(&root));

        let mut watcher = RecommendedWatcher::new(
            move |result: notify::Result<Event>| match result {
                Ok(event) => handle_event(&inner, &cb_root, &cb_rules, &event),
                Err(err) => log::warn!("[watcher] {:?} error: {}", cb_root, err),
            },
            NotifyConfig::default(),
        )
        .map_err(|err| format!("failed to create watcher for {}: {}", root.display(), err))?;

        watcher
            .watch(&root, RecursiveMode::Recursive)
            .map_err(|err| format!("failed to watch {}: {}", root.display(), err))?;

        watchers.insert(root, watcher);
        Ok(())
    }

    /// Stop watching `root`, dropping its watcher and any queued emissions.
    /// Unknown roots are a no-op, so the command stays idempotent.
    pub fn unwatch(&self, root: &Path) -> Result<(), String> {
        let root = root.to_path_buf();
        let mut watchers = self.watchers.lock();
        match watchers.remove(&root) {
            None => Ok(()),
            Some(mut watcher) => {
                // Dropping the watcher stops the OS-level watch as well; the
                // explicit unwatch just reports genuine backend failures.
                if let Err(err) = watcher.unwatch(&root) {
                    log::debug!(
                        "[watcher] unwatch {} failed (dropping anyway): {}",
                        root.display(),
                        err
                    );
                }
                drop(watcher);
                self.inner.state.lock().clear_root(&root);
                Ok(())
            }
        }
    }
}

impl Drop for WatchManager {
    fn drop(&mut self) {
        // Stop the flusher first so nothing is emitted mid-teardown.
        self.inner.state.lock().shutdown = true;
        self.inner.wake.notify_all();
        if let Some(handle) = self.flusher.take() {
            let _ = handle.join();
        }

        // Unwatch + drop every notify watcher (kills the OS-level watch).
        for (root, mut watcher) in self.watchers.lock().drain() {
            if let Err(err) = watcher.unwatch(&root) {
                log::debug!(
                    "[watcher] unwatch {} during shutdown failed: {}",
                    root.display(),
                    err
                );
            }
        }
    }
}

/// Filter one notify event and queue every surviving path for emission.
fn handle_event(inner: &Arc<Inner>, root: &Path, rules: &IgnoreRules, event: &Event) {
    if event.need_rescan() {
        log::warn!("[watcher] {:?} dropped events (rescan required)", root);
        return;
    }
    let action = match action_for_kind(&event.kind) {
        Some(action) => action,
        None => return,
    };
    for path in &event.paths {
        if should_skip(root, path, rules) {
            continue;
        }
        inner.push(path.clone(), action);
    }
}

/// Background thread: emit whatever has passed its debounce deadline.
///
/// Waits on a condvar rather than polling, but always with a bounded timeout
/// so a missed notify can never wedge the loop.
fn flush_loop(inner: Arc<Inner>) {
    let mut state = inner.state.lock();
    loop {
        if state.shutdown {
            break;
        }

        let now = Instant::now();
        let due = state.take_due(now);
        if !due.is_empty() {
            drop(state);
            for emission in due {
                emit_file_changed(&inner.app, &emission.path, &emission.action);
            }
            state = inner.state.lock();
            continue;
        }

        match state.next_deadline() {
            Some(deadline) => {
                let wait = deadline.saturating_duration_since(now);
                inner.wake.wait_for(&mut state, wait);
            }
            None => {
                inner.wake.wait(&mut state);
            }
        }
    }
}

/// Serialize a [`DwoEvent::FileChanged`] and broadcast it to the frontend.
///
/// The payload keeps the enum's serde shape (`tag = "type"`,
/// `content = "data"`), i.e. `{"type":"FileChanged","data":{path,action}}`.
fn emit_file_changed(app: &AppHandle, path: &Path, action: &str) {
    let event = DwoEvent::FileChanged {
        path: path.to_string_lossy().into_owned(),
        action: action.to_string(),
    };
    if let Err(err) = app.emit(event.event_name(), &event) {
        log::warn!("[watcher] failed to emit {}: {}", event.event_name(), err);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    // Test-only notify kinds; kept out of the module imports above so the
    // non-test build does not warn about unused imports.
    use notify::event::{AccessKind, AccessMode, CreateKind, RemoveKind, RenameMode};

    fn path(text: &str) -> PathBuf {
        PathBuf::from(text)
    }

    // ── kind mapping ───────────────────────────────────────────────────────

    #[test]
    fn maps_event_kinds_to_actions() {
        assert_eq!(
            action_for_kind(&EventKind::Create(CreateKind::File)),
            Some("created")
        );
        assert_eq!(
            action_for_kind(&EventKind::Modify(ModifyKind::Any)),
            Some("modified")
        );
        assert_eq!(
            action_for_kind(&EventKind::Modify(ModifyKind::Name(RenameMode::Both))),
            Some("renamed")
        );
        assert_eq!(
            action_for_kind(&EventKind::Modify(ModifyKind::Name(RenameMode::Any))),
            Some("renamed")
        );
        assert_eq!(
            action_for_kind(&EventKind::Remove(RemoveKind::File)),
            Some("removed")
        );
        assert_eq!(action_for_kind(&EventKind::Any), Some("modified"));
    }

    #[test]
    fn ignores_non_mutating_kinds() {
        assert_eq!(
            action_for_kind(&EventKind::Access(AccessKind::Open(AccessMode::Read))),
            None
        );
        assert_eq!(action_for_kind(&EventKind::Access(AccessKind::Read)), None);
        assert_eq!(action_for_kind(&EventKind::Other), None);
    }

    // ── temp / editor artifacts ────────────────────────────────────────────

    #[test]
    fn detects_editor_artifacts() {
        assert!(is_temp_artifact(".env"));
        assert!(is_temp_artifact(".DS_Store"));
        assert!(is_temp_artifact(".main.rs.swp"));
        assert!(is_temp_artifact("#main.rs#"));
        assert!(is_temp_artifact("main.rs~"));
        assert!(is_temp_artifact("main.swp"));
        assert!(is_temp_artifact("main.swx"));
        assert!(!is_temp_artifact("main.rs"));
        assert!(!is_temp_artifact("Cargo.toml"));
    }

    // ── shared ignore rules ────────────────────────────────────────────────

    #[test]
    fn skips_ignored_and_temp_paths() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        std::fs::create_dir_all(root.join("src")).unwrap();
        std::fs::create_dir_all(root.join("node_modules")).unwrap();
        std::fs::create_dir_all(root.join("logs")).unwrap();
        std::fs::write(root.join(".gitignore"), "logs/\n*.log\n").unwrap();

        let rules = IgnoreRules::load(root);

        // Ordinary visible file: reported.
        assert!(!should_skip(root, &root.join("src/main.rs"), &rules));
        // The root itself is never a change.
        assert!(should_skip(root, root, &rules));
        // Default-ignored name anywhere below the root.
        assert!(should_skip(
            root,
            &root.join("node_modules/pkg/index.js"),
            &rules
        ));
        assert!(should_skip(root, &root.join("node_modules"), &rules));
        // `.gitignore`-ignored directory and file.
        assert!(should_skip(root, &root.join("logs/debug.txt"), &rules));
        assert!(should_skip(root, &root.join("debug.log"), &rules));
        // Temp/editor artifacts.
        assert!(should_skip(root, &root.join(".env"), &rules));
        assert!(should_skip(root, &root.join("main.rs~"), &rules));
        assert!(should_skip(root, &root.join(".main.rs.swp"), &rules));
        assert!(should_skip(root, &root.join("#main.rs#"), &rules));
    }

    #[test]
    fn ignored_names_above_the_root_do_not_poison_it() {
        // A workspace nested under an ignored name must still report changes:
        // ignore decisions are made relative to the watched root only.
        let outer = tempfile::tempdir().unwrap();
        let root = outer.path().join("dist");
        std::fs::create_dir_all(&root).unwrap();
        std::fs::write(root.join(".gitignore"), "").unwrap();

        let rules = IgnoreRules::load(&root);
        assert!(!should_skip(&root, &root.join("bundle.js"), &rules));
        assert!(should_skip(&root, &root.join("dist/bundle.js"), &rules));
    }

    // ── debounce ───────────────────────────────────────────────────────────

    #[test]
    fn collapses_a_burst_into_one_emission() {
        let mut debouncer = Debouncer::default();
        let start = Instant::now();

        debouncer.push(path("/w/a.rs"), "modified", start);
        debouncer.push(path("/w/a.rs"), "modified", start + Duration::from_millis(50));
        debouncer.push(path("/w/a.rs"), "modified", start + Duration::from_millis(190));

        // Still inside the window: nothing emitted, one entry kept.
        assert!(debouncer.take_due(start + Duration::from_millis(199)).is_empty());
        assert_eq!(debouncer.len(), 1);

        // Quiet for 200ms after the *last* write → exactly one emission.
        let due = debouncer.take_due(start + Duration::from_millis(390));
        assert_eq!(due.len(), 1);
        assert_eq!(due[0].path, path("/w/a.rs"));
        assert_eq!(due[0].action, "modified");
        assert_eq!(debouncer.len(), 0);
        assert!(debouncer.take_due(start + Duration::from_secs(5)).is_empty());
    }

    #[test]
    fn last_write_wins_and_extends_the_window() {
        let mut debouncer = Debouncer::default();
        let start = Instant::now();

        debouncer.push(path("/w/a.rs"), "modified", start);
        debouncer.push(path("/w/a.rs"), "modified", start + Duration::from_millis(150));

        // Deadline moved to last write + 200ms, not first write + 200ms.
        assert!(debouncer
            .take_due(start + Duration::from_millis(250))
            .is_empty());
        let due = debouncer.take_due(start + Duration::from_millis(350));
        assert_eq!(due.len(), 1);
        assert_eq!(due[0].deadline, start + Duration::from_millis(350));
    }

    #[test]
    fn keys_on_path_and_action() {
        let mut debouncer = Debouncer::default();
        let start = Instant::now();

        debouncer.push(path("/w/a.rs"), "created", start);
        debouncer.push(path("/w/a.rs"), "modified", start + Duration::from_millis(10));
        debouncer.push(path("/w/b.rs"), "modified", start);

        // Same path with a different action is a distinct key.
        assert_eq!(debouncer.len(), 3);
        let due = debouncer.take_due(start + Duration::from_millis(250));
        assert_eq!(due.len(), 3);
    }

    #[test]
    fn unwatching_clears_queued_emissions() {
        let mut debouncer = Debouncer::default();
        let start = Instant::now();
        debouncer.push(path("/w/a.rs"), "modified", start);
        debouncer.push(path("/w/sub/b.rs"), "modified", start);
        debouncer.push(path("/other/c.rs"), "modified", start);

        debouncer.clear_root(Path::new("/w"));
        assert_eq!(debouncer.len(), 1);
        let due = debouncer.take_due(start + Duration::from_secs(1));
        assert_eq!(due[0].path, path("/other/c.rs"));
    }

    // ── the real backend ───────────────────────────────────────────────────

    /// End-to-end sanity check against the platform watcher: a write inside a
    /// watched tree must reach the event handler and map to an action.
    #[test]
    fn platform_watcher_reports_created_files() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().to_path_buf();

        let (tx, rx) = std::sync::mpsc::channel();
        let mut watcher = RecommendedWatcher::new(
            move |result: notify::Result<Event>| {
                let _ = tx.send(result);
            },
            NotifyConfig::default(),
        )
        .expect("failed to create platform watcher");
        watcher
            .watch(&root, RecursiveMode::Recursive)
            .expect("failed to watch temp dir");

        std::fs::write(root.join("created.txt"), b"hello").unwrap();

        let deadline = Instant::now() + Duration::from_secs(10);
        let mut reported = false;
        while Instant::now() < deadline {
            match rx.recv_timeout(Duration::from_millis(200)) {
                Ok(Ok(event)) => {
                    let is_target = event
                        .paths
                        .iter()
                        .any(|p| p.ends_with("created.txt"));
                    if is_target && action_for_kind(&event.kind) == Some("created") {
                        reported = true;
                        break;
                    }
                }
                // Timeout or a dropped stream: keep polling until the deadline.
                Ok(Err(_)) | Err(_) => {}
            }
        }

        drop(watcher);
        assert!(
            reported,
            "platform watcher never reported `created.txt` within 10s"
        );
    }
}
