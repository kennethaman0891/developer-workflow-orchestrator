# Session Handoff Feature Plan — DWO

## Problem Statement

You run tasks across multiple terminal sessions in DWO. When Terminal A finishes a piece of work, you want Terminal B to be able to pick up the context — the commands run, the output produced, the working state — without manually re-typing or re-explaining everything.

This is **session handoff**: package a terminal's conversation into a portable artifact, then inject it into another terminal so it can resume as if it were there all along.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│  Frontend (React / TypeScript)                          │
│                                                         │
│  ┌──────────────┐   ┌──────────────┐   ┌────────────┐ │
│  │ Terminal Pool│   │ Handoff Panel│   │  History   │ │
│  │  (existing)  │   │  (new UI)    │   │  Viewer    │ │
│  └──────┬───────┘   └──────┬───────┘   └─────┬──────┘ │
│         │                  │                  │        │
│         └──────────────────┼──────────────────┘        │
│                            ▼                           │
│              useTerminalHandoff() hook                 │
│              (new state layer)                         │
└────────────────────┬────────────────────────────────────┘
                     │ Tauri invoke
┌────────────────────▼────────────────────────────────────┐
│  Rust Backend (src-tauri/src/handoff/)                   │
│                                                         │
│  ┌──────────────────────────────────────────────────┐   │
│  │  HandoffManager  (singleton, app-managed)         │   │
│  │  - in-memory store of captured sessions           │   │
│  │  - file persistence (~/.config/dwo/handoffs/)     │   │
│  │  - injection engine                               │   │
│  └──────────────────────────────────────────────────┘   │
│                                                         │
│  Commands:                                              │
│    handoff_capture(id)     → HandoffArtifact            │
│    handoff_get(id)         → Option<HandoffArtifact>     │
│    handoff_list()          → Vec<SessionSummary>         │
│    handoff_inject(target, src_id) → Result<(), String>  │
│    handoff_clear(id)       → Result<(), String>          │
│    handoff_delete(id)      → Result<(), String>          │
└─────────────────────────────────────────────────────────┘
```

---

## Data Model

### `HandoffArtifact` (serialized payload)

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HandoffArtifact {
    pub id: String,                      // UUID v4
    pub source_session_id: String,       // origin terminal ID
    pub title: String,                   // user-given or auto-generated
    pub created_at: DateTime<Utc>,

    // Context snapshot
    pub cwd: PathBuf,
    pub shell: String,                   // e.g. "bash", "zsh"
    pub columns: u16,
    pub rows: u16,

    // Captured content
    pub scrollback: Vec<String>,         // last N lines from PTY
    pub injected_commands: Vec<String>,  // commands extracted from prompt
    pub notes: Option<String>,           // optional user annotations

    // Metadata for the receiver
    pub resume_hint: Option<String>,     // plain-text summary
}
```

### `SessionSummary` (for listing / sidebar)

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionSummary {
    pub id: String,
    pub source_session_id: String,
    pub title: String,
    pub created_at: DateTime<Utc>,
    pub line_count: usize,
    pub cwd: PathBuf,
}
```

---

## Implementation Phases

### Phase 1 — Rust Backend (`src-tauri/src/handoff/`)

**New files:**
- `mod.rs` — module declaration
- `types.rs` — `HandoffArtifact`, `SessionSummary` structs
- `manager.rs` — `HandoffManager` singleton with in-memory + disk persistence
- `commands.rs` — Tauri command handlers

**Key logic in `HandoffManager`:**

```rust
pub struct HandoffManager {
    artifacts: RwLock<HashMap<String, HandoffArtifact>>,
    data_dir: PathBuf,  // ~/.config/dwo/handoffs/
}

impl HandoffManager {
    // Persist to JSON on every mutation
    fn save(&self, artifact: &HandoffArtifact) -> Result<(), String> { ... }
    fn load_all(&self) -> Result<(), String> { ... }

    // Capture: reads scrollback from an existing TerminalSession,
    // extracts a resume hint (last N meaningful lines), returns artifact
    pub fn capture(&self, term_mgr: &TerminalManager, session_id: &str) -> Result<String, String> { ... }

    // Inject: writes a script into the target terminal that
    // 1) changes to the captured cwd
    // 2) echoes a header banner
    // 3) replays the scrollback as context
    // 4) prints a prompt inviting the user to continue
    pub fn inject(&self, target_id: &str, source_id: &string) -> Result<(), String> { ... }
}
```

**Injection strategy** — the injected script sent to the receiving terminal:

```
echo ""
echo "═══ SESSION HANDOFF ═══"
echo "Source: <title>  |  CWD: <path>  |  Created: <date>"
echo "Lines captured: <N>"
echo ""
# Replay last 50 lines of scrollback as silent context
<scrollback_tail>
echo ""
echo "▶ Handoff complete. Context loaded. What would you like to do next?"
echo "═══ END HANDOFF ═══"
echo ""
```

This is safe because it's just echo + text — no arbitrary command execution.

### Phase 2 — Frontend Hook (`src/hooks/useTerminalHandoff.ts`)

```typescript
export function useTerminalHandoff() {
  const [artifacts, setArtifacts] = useState<SessionSummary[]>([]);
  const [selected, setSelected] = useState<HandoffArtifact | null>(null);

  const capture = useCallback(async (sessionId: string) => { ... };
  const getArtifact = useCallback(async (id: string) => { ... };
  const inject = useCallback(async (targetId: string, sourceId: string) => { ... };
  const list = useCallback(async () => { ... };
  const clear = useCallback(async (id: string) => { ... };
  const delete_ = useCallback(async (id: string) => { ... };

  useEffect(() => { list().catch(console.error); }, [list]);

  return { artifacts, selected, capture, getArtifact, inject, list, clear, delete: delete_ };
}
```

### Phase 3 — Frontend UI (`src/components/handoff/`)

**New component: `HandoffPanel.tsx`**

A side-panel (toggleable) with three sections:

```
┌─────────────────────────────────────────┐
│  ◀  Session Handoff               [✕]   │
├─────────────────────────────────────────┤
│  [+ Capture Current]                    │
├─────────────────────────────────────────┤
│  Captured Sessions (3)                  │
│                                         │
│  ● Build Output      2m ago   47 lines  │
│    ~/.dwo/project-a    cwd: /home/...  │
│    [Inject ▸]  [View]  [Delete]         │
│                                         │
│  ● DB Migration      15m ago  112 lines │
│    ~/.dwo/project-b    cwd: /home/...  │
│    [Inject ▸]  [View]  [Delete]         │
│                                         │
│  ● Lint Results      1h ago   23 lines  │
│    ...                                  │
├─────────────────────────────────────────┤
│  Target Terminal: [▼ Terminal 2  ▾]     │
│  [Inject Selected →]                    │
└─────────────────────────────────────────┘
```

**View modal** — expand any artifact to see full scrollback in a read-only pane.

### Phase 4 — Integration

- Add `HandoffPanel` toggle to the main app toolbar (or sidebar)
- Wire up `useTerminals()` + `useTerminalHandoff()` together
- In `lib.rs`, register the new module and commands
- Export from `src/hooks/index.ts` (or wherever hooks are collected)

---

## File Checklist

| File | Action | Layer |
|------|--------|-------|
| `src-tauri/src/handoff/mod.rs` | Create | Rust |
| `src-tauri/src/handoff/types.rs` | Create | Rust |
| `src-tauri/src/handoff/manager.rs` | Create | Rust |
| `src-tauri/src/handoff/commands.rs` | Create | Rust |
| `src-tauri/src/lib.rs` | Edit | Rust — add `pub mod handoff;`, register commands |
| `src/hooks/useTerminalHandoff.ts` | Create | TS |
| `src/components/handoff/HandoffPanel.tsx` | Create | React |
| `src/components/handoff/HandoffViewer.tsx` | Create | React (optional detail view) |
| `app/page.tsx` or shell component | Edit | React — wire in HandoffPanel |

---

## Persistence Design

- Artifacts stored as individual JSON files in `~/.config/dwo/handoffs/<uuid>.json`
- Loaded once at startup via `HandoffManager::load_all()`
- Saved after every `capture`, `inject`, `clear`, `delete`
- This makes handoffs survivable across app restarts and lets users share them between machines by copying the directory

---

## Security Considerations

- Injection only sends `echo` and plain text — **no arbitrary command execution**
- Scrollback is read-only from the source terminal; we never read stdin
- The receiving terminal's user sees the injected text as normal output and decides what to do next
- No credentials or sensitive data are automatically captured beyond what's already in the visible scrollback

---

## Future Extensions (out of scope for v1)

- **Smart diff injection**: detect file changes during the source session and offer to apply them
- **Shared clipboard**: paste handoff text into any external terminal (not just DWO)
- **Multi-target inject**: send the same handoff to multiple terminals at once
- **Prompt-assisted injection**: before injecting, ask "what should the next terminal focus on?" and prepend a custom prompt

---

## Summary

This is a focused, low-risk feature. The core loop is:

1. User clicks **"Capture Current"** → Rust reads scrollback, builds artifact, saves to disk
2. User picks an artifact + target terminal → Rust writes an `echo`-based script into the target's PTY
3. Target terminal displays the handoff context and a prompt inviting continuation

Estimated scope: ~300 lines of Rust, ~200 lines of TypeScript/React. No new dependencies required.
