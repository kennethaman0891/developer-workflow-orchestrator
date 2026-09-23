# DWO Rust Backend Issues — Plan

All issues below are **backend-only** (Rust/Tauri). Nothing touches the frontend UI.
The project currently compiles with 0 errors, but cargo check did not warn about dead
modules because they are `pub mod`s reachable from `mod.rs`.

---

## 1. Dead-code modules: `terminal::output` and `terminal::render_scheduler`

**Files:** `src/terminal/output.rs` (63 lines), `src/terminal/render_scheduler.rs` (32 lines)

**Problem:** Both define `pub` items (`OutputBuffer`, `schedule_render`) that are
declared in `mod.rs` but never referenced anywhere else in the crate. They add
compile weight and maintenance burden for zero runtime effect.

**Fix:** Remove both files and the corresponding `pub mod` lines from
`src/terminal/mod.rs`.

---

## 2. License `activate` — signature extraction reads wrong slice

**File:** `src/license/license.rs:97`

**Problem:**
```rust
let key_bytes = general_purpose::STANDARD.decode(signed_key)?;   // decoded
// …
let signature = ed25519_dalek::Signature::from_slice(
    &signed_key.as_bytes()[64..]   // ← original base64 STRING sliced at byte 64
)?;
```
`signed_key` is the *original base64-encoded string*. Slicing it at byte 64
pulls random chars from the encoding, not the 64-byte signature that follows the
32-byte public key in the raw binary. The correct slice is `&key_bytes[32..]`.

**Fix:**
```rust
let signature = ed25519_dalek::Signature::from_slice(&key_bytes[32..])?;
```

---

## 3. Git manager — all methods are stubs (no real git ops)

**File:** `src/git/git.rs`

**Problem:** Every method returns hardcoded placeholders:
- `status()` → always `branch: "main"`, empty vectors
- `stage()` / `commit()` → always `success: true`
- `log()` → two canned strings
- `branch()` → always `"main"`

The struct stores `repo_path` but never uses it (hence `#[allow(dead_code)]`).

**Fix options (pick one):**
- **(A) Wire real git via `git2` crate** — add `git2 = "0.19"` to Cargo.toml,
  implement each method against an actual repository opened from `repo_path`.
- **(B) Shell out with `Command`** — invoke `git status`, `git diff`, etc. via
  `tokio::process::Command`. Simpler, no new dependency, but less idiomatic.

At minimum, `status()` should return an error when `repo_path` doesn't exist or
isn't a git repo rather than lying.

---

## 4. License `status` and `deactivate` — hardcoded `"default"` machine_id

**File:** `src/license/commands.rs:38,62`

**Problem:**
```rust
pub async fn status(state: State<'_, LicenseManager>) -> Result<Tier, String> {
    Ok(state.inner().get_tier("default"))  // ← hardcoded
}
pub async fn deactivate(state: State<'_, LicenseManager>) -> Result<bool, String> {
    let mut lm = state.inner().clone();
    Ok(lm.deactivate("default"))            // ← hardcoded
}
```
`activate` correctly derives the machine ID from the environment; `status` and
`deactivate` do not. A user who activates on machine A then calls `status` will
always see `Free`, and `deactivate` will silently succeed even if no license
exists under `"default"`.

**Fix:** Derive the machine ID the same way as in `activate`:
```rust
fn machine_id() -> String {
    std::env::var("HOSTNAME").unwrap_or_else(|_| "default-machine".to_string())
}
```
Then use `Self::machine_id()` in both commands.

---

## 5. `list_workspaces` returns wrong type

**File:** `src/state/commands.rs:56`

**Problem:**
```rust
pub async fn list_workspaces(state: State<'_, AppState>)
    -> Result<Vec<AppState>, String>  // ← should be Vec<Workspace>
{
    Ok(vec![state.inner().clone()])    // ← returns singleton AppState, not workspaces
}
```
The function returns a `Vec` containing exactly one `AppState` clone — not the
list of workspaces. The frontend would see `[ { workspaces: [...], tier: "free",
… } ]` instead of `[ { id, name, panes, … } ]`.

**Fix:**
```rust
#[tauri::command]
pub async fn list_workspaces(
    state: tauri::State<'_, AppState>,
) -> Result<Vec<super::super::state::state::Workspace>, String> {
    Ok(state.inner().workspaces.clone())
}
```
(Also add a public getter or make `workspaces` accessible.)

---

## 6. No actual task execution engine

**File:** `src/tasks/tasks.rs`

**Problem:** `TaskManager` tracks task metadata (create / update / delete /
results) but has no scheduler. `Task.schedule` is a cron string that is never
parsed or acted on. The `active` tasks sit idle forever.

**Scope note:** This is a feature-gap, not a bug in existing code. Implementing a
real cron-based scheduler (e.g. with `cron` or `tokio-cron-scheduler` crate) is
a medium-effort addition. Decide whether to tackle now or defer.

---

## 7. TerminalManager re-emits scrollback already held by the session

**File:** `src/terminal/manager.rs:62`

**Problem:** The async reader task calls
`reader_session.read().process_output_for_scrollback(&chunk)` every time a PTY
chunk arrives. `TerminalSession::process_output_for_scrollback` acquires the
scrollback lock and appends lines. The session *also* has its own
`add_to_scrollback` method that is never called from the manager path — so
there is only one writer, but the method exists under a different name, creating
confusion. More importantly, `session.process_output_for_scrollback` does
line-splitting on raw PTY bytes (which may contain escape sequences, partial
UTF-8, CRLF, etc.) without filtering CSI sequences — scrollback gets noisy.

**Fix:** Either:
- (A) Use a single consistent method (`add_to_scrollback` or `process_output_for_scrollback`)
  and strip ANSI escape codes before splitting lines.
- (B) Remove the duplicate and keep one canonical path.

---

## Priority Summary

| # | Issue | Severity | Effort |
|---|-------|----------|--------|
| 2 | License sig extraction reads wrong bytes | **High** — activation silently fails | 5 min |
| 4 | Hardcoded `"default"` in status/deactivate | **Medium** — license UX broken | 10 min |
| 5 | `list_workspaces` returns wrong type | **High** — frontend gets garbage | 5 min |
| 1 | Dead-code modules (output, render_scheduler) | Low — cleanup | 5 min |
| 3 | Git manager all stubs | **Medium** — git tab does nothing | 1–2 h |
| 7 | Scrollback noise from ANSI passthrough | Low — cosmetic | 20 min |
| 6 | No task scheduler (feature gap) | — — deferred | TBD |
