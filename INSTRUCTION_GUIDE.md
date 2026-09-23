# DWO — Instruction Guide

A comprehensive guide to the DWO (Developer Workflow Orchestrator) codebase, architecture, and technology stack.

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [Language Breakdown](#language-breakdown)
3. [Architecture](#architecture)
4. [Frontend Deep Dive](#frontend-deep-dive)
5. [Backend Deep Dive](#backend-deep-dive)
6. [Storage & Database](#storage--database)
7. [Key Directories](#key-directories)
8. [Development Workflow](#development-workflow)

---

## Project Overview

DWO is a **cross-platform desktop application** built with **Tauri v2** and **Next.js 15**. It provides developers with a unified workspace for:

- Managing multiple terminal sessions
- Running distributed AI agents
- Automating complex development workflows
- Code editing with syntax highlighting
- Git integration
- File system operations

**Version:** 2.0.0  
**Platforms:** macOS, Windows, Linux

---

## Language Breakdown

The project uses **6 programming languages/configurations** across ~79 source files and ~6,400 lines of code:

| Language | Lines | Files | Percentage | Role |
|----------|-------|-------|------------|------|
| TypeScript (TSX) | 2,870 | 20 | 44.9% | Frontend components & UI |
| Rust | 2,328 | 37 | 36.5% | Backend logic & native operations |
| TypeScript | 840 | 15 | 13.2% | Frontend hooks, utils, types |
| JSON | 149 | 5 | 2.3% | Configuration & state |
| Markdown | 144 | 1 | 2.3% | Documentation |
| TOML | 54 | 1 | 0.8% | Rust package manifest |

### Language Summary

- **~58% TypeScript** — The frontend layer (React components, hooks, utilities)
- **~37% Rust** — The backend layer (native operations, terminal management, agents)
- **~5% Config/Docs** — JSON configs, Markdown README, TOML manifests

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    FRONTEND (TypeScript/React)                  │
│                                                                 │
│  app/               — Next.js App Router pages                  │
│  src/components/    — React UI components                       │
│  src/hooks/         — Custom React hooks                        │
│  src/lib/           — Utility functions                         │
│  src/contexts/      — React context providers                   │
│  src/types/         — TypeScript type definitions               │
│                                                                 │
│  Runs in: Browser window (rendered by Tauri)                    │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             │ Tauri IPC (invoke / listen)
                             │
┌────────────────────────────▼────────────────────────────────────┐
│                    BACKEND (Rust)                               │
│                                                                 │
│  src-tauri/src/                                                 │
│  ├── main.rs       — Application entry point                   │
│  ├── lib.rs        — Library exports & Tauri setup             │
│  ├── terminal/     — PTY terminal management                   │
│  ├── fs/           — File system operations                    │
│  ├── git/          — Git command execution                     │
│  ├── agents/       — AI agent orchestration                    │
│  ├── tasks/        — Task management                           │
│  ├── license/      — License validation                        │
│  ├── plugins/      — Plugin system                             │
│  ├── state/        — App state persistence                     │
│  ├── events/       — Event handling                            │
│  └── diagnostics/  — Error reporting                           │
│                                                                 │
│  Runs in: Native process (system-level access)                  │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             │ read/write
                             │
┌────────────────────────────▼────────────────────────────────────┐
│                    STORAGE (JSON Files)                         │
│                                                                 │
│  data/state.json      — Current app state                       │
│  ~/.config/dwo/       — Persisted user data                     │
│                                                                 │
│  No traditional database — plain JSON serialization             │
└─────────────────────────────────────────────────────────────────┘
```

---

## Frontend Deep Dive

### What It Is

The frontend is a **React 19 application** built with **Next.js 15** using the App Router. It runs inside a Tauri window (like a browser) but has access to native system features through Rust.

### Key Technologies

| Technology | Purpose | Why You See It |
|------------|---------|----------------|
| `react` | Component framework | `import { useState } from 'react'` |
| `next` | Page routing & SSR | `'use client'`, `app/page.tsx` |
| `@codemirror/*` | Code editor | Syntax-highlighted code editing |
| `xterm` | Terminal emulator | Terminal windows in the UI |
| `@tauri-apps/api` | Bridge to backend | Calling Rust functions from JS |

### File Structure

```
app/
├── layout.tsx      — Root layout (wraps entire app)
├── page.tsx        — Main home page (App component)
└── global-error.tsx — Error boundary

src/
├── components/     — UI components
│   ├── editor/CodeEditor.tsx      — CodeMirror wrapper
│   ├── terminal/TerminalPool.tsx  — Terminal container
│   ├── shell/Sidebar.tsx          — Left sidebar navigation
│   ├── orchestrator/AgentOrchestrator.tsx
│   ├── git/GitPanel.tsx
│   ├── tasks/TaskAutomation.tsx
│   ├── settings/SettingsPanel.tsx
│   └── ... (more components)
│
├── hooks/          — Custom React hooks
│   ├── useWorkspaces.ts
│   ├── useTerminals.ts
│   ├── useGit.ts
│   ├── useAgents.ts
│   └── ... (more hooks)
│
├── lib/            — Utilities
│   ├── workspace.ts
│   ├── terminal.ts
│   ├── license.ts
│   └── theme.ts
│
├── contexts/       — React contexts
│   └── ThemeContext.tsx
│
└── types/          — TypeScript types
    └── tauri.d.ts  — Tauri command type declarations
```

### Important Note About `.tsx` Files

`.tsx` = **TypeScript + JSX** = React components with TypeScript typing.  
This is standard React — nothing different underneath. The "TS" just means the code has type annotations.

Example from `app/page.tsx`:
```typescript
'use client';
import { useState } from 'react';        // ← React hook
import { Sidebar } from '@/components/shell/Sidebar';  // ← React component
// ... this is plain React, just typed
```

---

## Backend Deep Dive

### What It Is

The backend is written in **Rust** and packaged using **Tauri v2**. It runs as a native process alongside the frontend, giving it direct access to:
- The file system
- The terminal (PTY)
- System processes
- Network connections

This is why Rust is perfect for this project — it's fast, safe, and can control low-level system operations.

### Key Technologies

| Technology | Version | Purpose |
|------------|---------|---------|
| `tauri` | 2.x | Desktop app framework |
| `tokio` | 1.x | Async runtime (like Node's event loop) |
| `portable-pty` | 0.9 | Terminal spawning & control |
| `serde` | 1.x | JSON serialization |
| `ed25519-dalek` | 2.x | License signing/verification |
| `uuid` | 1.x | Unique ID generation |
| `chrono` | 0.4 | Date/time handling |
| `zip` | 0.6 | ZIP archive handling |

### Module Structure

```
src-tauri/src/
│
├── main.rs           Entry point — launches Tauri app
├── lib.rs            Library root — registers all modules
│
├── terminal/         Terminal management
│   ├── session.rs    Individual terminal sessions
│   ├── manager.rs    Session lifecycle management
│   ├── pty.rs        PTY (pseudo-terminal) operations
│   ├── commands.rs   Tauri commands for terminals
│   └── mod.rs        Module exports
│
├── fs/               File system operations
│   ├── fs.rs         Core file operations
│   ├── commands.rs   Exposed commands
│   └── mod.rs
│
├── git/              Git integration
│   ├── git.rs        Git command execution
│   ├── commands.rs
│   └── mod.rs
│
├── agents/           AI agent orchestration
│   ├── agents.rs     Agent state & coordination
│   ├── commands.rs
│   └── mod.rs
│
├── tasks/            Task automation
│   ├── tasks.rs
│   ├── commands.rs
│   └── mod.rs
│
├── license/          License management
│   ├── license.rs    Key verification (Ed25519)
│   ├── commands.rs
│   └── mod.rs
│
├── plugins/          Plugin system
│   ├── plugins.rs
│   ├── commands.rs
│   └── mod.rs
│
├── state/            Application state
│   ├── state.rs      Workspace & preference persistence
│   ├── commands.rs
│   └── mod.rs
│
├── events/           Event system
│   ├── events.rs
│   └── mod.rs
│
└── diagnostics/      Error reporting
    ├── commands.rs
    └── mod.rs
```

### How Frontend Talks to Backend

```typescript
// Frontend (TypeScript) calls a Rust function:
import { invoke } from '@tauri-apps/api/core';

const result = await invoke('get_workspaces');
```

```rust
// Backend (Rust) defines the command:
#[tauri::command]
fn get_workspaces(state: State<AppState>) -> Vec<Workspace> {
    state.lock().workspaces.clone()
}
```

This bidirectional communication is handled automatically by Tauri.

---

## Storage & Database

### There Is NO Traditional Database

DWO does not use SQLite, PostgreSQL, MongoDB, or any database server. Instead, it uses **plain JSON files** for persistence.

### Storage Locations

| Location | Purpose |
|----------|---------|
| `data/state.json` | In-project state (for development) |
| `~/.config/dwo/` | User data directory (production) |
| `~/Library/Application Support/dwo/` | macOS-specific storage |

### What Gets Stored

```json
// data/state.json (simplified)
{
  "workspaces": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "name": "My Project",
      "panes": ["terminal-1", "terminal-2"],
      "created_at": "2024-01-15T10:30:00Z",
      "updated_at": "2024-01-15T14:22:00Z"
    }
  ],
  "active_workspace_id": "550e8400-e29b-41d4-a716-446655440000",
  "tier": "pro",
  "license_key": "..."
}
```

### Why JSON Instead of a Database?

- Simple data model (no relational queries needed)
- Easy to version control and debug
- Fast read/write for small datasets
- No database server to install/maintain
- Works cross-platform without configuration

---

## Key Directories

| Directory | Purpose | What's Inside |
|-----------|---------|---------------|
| `app/` | Next.js pages | `page.tsx`, `layout.tsx`, error handlers |
| `src/` | Frontend source | Components, hooks, utilities, types |
| `src-tauri/` | Backend source | Rust code, Tauri config, build scripts |
| `public/` | Static assets | Logo, icons, images |
| `data/` | Runtime data | `state.json` (current app state) |
| `.claude/` | Claude Code config | Settings, skills, profiles |
| `.freebuff/` | FreeBuff config | Project ID |
| `.next/` | Build output | Generated Next.js files (don't edit) |
| `out/` | Export output | Static export (run `npm run export`) |
| `node_modules/` | Dependencies | npm packages (auto-generated) |
| `target/` | Rust build | Compiled artifacts (don't commit) |

---

## Development Workflow

### Prerequisites

```bash
# Install Node.js (LTS version)
# Install Rust toolchain
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Install project dependencies
cd /path/to/DWO
npm install
cd src-tauri && cargo fetch && cd ..
```

### Run in Development Mode

```bash
# Start the dev server (hot reload enabled)
npm run dev
```

This launches:
1. Next.js dev server on `http://localhost:3000`
2. Tauri dev mode with Rust hot reload

### Build for Production

```bash
# Create static export
npm run export

# Build desktop app (macOS .app, Windows .exe, Linux AppImage)
npm run build
```

### Common Commands

```bash
npm run dev          # Start development server
npm run build        # Build for production
npm run export       # Static export
npm run lint         # Check code quality
npm run format       # Auto-format code
npm run typecheck    # TypeScript type checking
```

---

## Quick Reference

### Adding a New Backend Feature

1. Create module in `src-tauri/src/your_module/`
2. Add to `src-tauri/src/lib.rs`
3. Define `#[tauri::command]` functions in `commands.rs`
4. Call from frontend via `invoke('command_name')`

### Adding a New Frontend Component

1. Create file in `src/components/YourComponent.tsx`
2. Import and use in `app/page.tsx` or parent component
3. Add styles inline or in CSS modules

### License System

- Uses **Ed25519** signature verification
- License key validates against public key
- Tier levels: `free` vs `pro`
- Stored in `AppState` struct

---

*Generated for DWO v2.0.0*  
*Last updated: 2026-09-23*
