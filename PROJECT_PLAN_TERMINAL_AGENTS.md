# Terminal Agents System — Project Plan

**Status:** Planned (Not Started)  
**Priority:** High  
**Build Timeline:** Future  
**Budget:** Paid tools only (no free-tier limitations)

---

## 🎯 Vision Statement

Build a system of **multiple specialized AI agents**, each living in their own terminal, with:
- **Fixed memory** (never forgets, always ready)
- **Proactive behavior** (finds errors before you do)
- **Permission-based execution** (asks before acting)
- **Voice interface** (natural conversation)
- **100% local-first** (no API dependencies, no subscriptions)

This is NOT another chatbot. This is an **AI workforce** for developers.

---

## 🔑 Core Innovation

| What Exists Today | What We Build |
|------------------|---------------|
| One AI assistant (Claude, GPT) | **Multiple specialized agents** |
| Shared context window | **Fixed, isolated memory per agent** |
| Reactive (waits for prompts) | **Proactive (goes ahead, finds problems)** |
| Generic capabilities | **Specialized expertise (UI/UX, Debug, Research, Build)** |
| Loses context between sessions | **Persistent memory forever** |
| Runs whatever you ask | **Asks PERMISSION before acting** |
| Requires API calls | **Runs locally, no cloud needed** |

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     VOICE / TEXT INPUT                      │
│                    (Wake Word Detection)                    │
└──────────────────────────┬──────────────────────────────────┘
                           │
              ┌────────────▼────────────┐
              │     Orchestrator        │
              │   (DWO Enhanced)        │
              │                         │
              │  • Parses job requests  │
              │  • Routes to correct    │
              │    terminal             │
              │  • Manages permissions  │
              │  • Aggregates results   │
              └────────────┬────────────┘
                           │
        ┌──────────────────┼──────────────────┐
        │                  │                  │
        ▼                  ▼                  ▼
┌───────────────┐ ┌───────────────┐ ┌───────────────┐
│  Terminal A   │ │  Terminal B   │ │  Terminal C   │
│  UI/UX Agent  │ │  Research     │ │  Debug Agent  │
│               │ │  Agent        │ │               │
│ Fixed Memory: │ │ Fixed Memory: │ │ Fixed Memory: │
│ • Design      │ │ • Docs        │ │ • Vulnerability│
│   patterns    │ │ • APIs        │ │   patterns    │
│ • Components  │ │ • Libraries   │ │ • Security    │
│ • CSS/HTML    │ │ • Research    │ │   best        │
│               │ │   methods     │ │   practices   │
└───────┬───────┘ └───────┬───────┘ └───────┬──────┘
        │                 │                 │
        └─────────────────┼─────────────────┘
                          │
              ┌───────────▼───────────┐
              │   Permission Layer    │
              │                       │
              │  • File access        │
              │  • npm commands       │
              │  • Git operations     │
              │  • Network requests   │
              │  • System changes     │
              └───────────────────────┘
```

---

## 👥 Terminal Specializations

| Terminal | Role | Expertise Area | Fixed Memory Includes |
|----------|------|----------------|----------------------|
| **Term A** | UI/UX Agent | Design systems, components, layouts, accessibility | Design tokens, component library, brand guidelines, past UI decisions |
| **Term B** | Research Agent | Documentation, APIs, libraries, best practices | Research notes, API docs, comparison tables, findings |
| **Term C** | Debug Agent | Error patterns, security vulnerabilities, code smells | Known issues, vulnerability patterns, debugging strategies |
| **Term D** | Build Agent | Deployment, CI/CD, Docker, infrastructure | Config templates, deployment history, environment specs |

*Can add more terminals as needed (DevOps, Testing, Documentation, etc.)*

---

## 🔧 Technical Stack

### Backend (Rust + Tauri)
```toml
[dependencies]
# Existing from DWO
tauri = "2"
tauri-plugin-shell = "2"
tauri-plugin-fs = "2"
tauri-plugin-dialog = "2"
tokio = { version = "1", features = ["full"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
portable-pty = "0.9"
uuid = { version = "1", features = ["v4", "serde"] }
chrono = { version = "0.4", features = ["serde"] }
parking_lot = "0.12"
async-channel = "2"

# NEW: Voice & AI Integration
vosk = "0.3"           # Local speech recognition
openai = "0.21"        # OpenAI API (paid tier)
anthropic = "0.26"     # Claude API (paid tier)
dashscope = "0.1"      # Alibaba/Qwen API (paid tier)

# NEW: Advanced Features
reqwest = { version = "0.12", features = ["json", "rustls-tls"] }
tokio-util = "0.7"
tracing = "0.1"
tracing-subscriber = "0.3"
```

### Frontend (React + Next.js)
```json
{
  "dependencies": {
    "next": "15.2.3",
    "react": "^19.1.0",
    "react-dom": "^19.1.0",
    "@tauri-apps/api": "^2.5.0",
    "xterm": "^5.3.0",
    "xterm-addon-fit": "^0.8.0",
    "@codemirror/*": "^6.x",
    
    // NEW
    "framer-motion": "^11.x",   // Smooth animations
    "zustand": "^4.x",          // State management
    "sonner": "^1.x"            // Toast notifications
  }
}
```

---

## 📁 Project Structure

```
terminal-agents/
├── src-tauri/
│   ├── src/
│   │   ├── main.rs              # Entry point
│   │   ├── lib.rs               # Library root
│   │   ├── orchestrator/        # Main orchestrator logic
│   │   │   ├── mod.rs
│   │   │   ├── router.rs        # Route jobs to correct terminal
│   │   │   └── permission.rs    # Permission request handling
│   │   ├── terminals/           # Terminal agent management
│   │   │   ├── mod.rs
│   │   │   ├── manager.rs       # Spawn/kill/monitor terminals
│   │   │   ├── agent.rs         # Base agent behavior
│   │   │   └── ui_ux.rs         # Terminal A (UI/UX specialist)
│   │   │   ├── research.rs      # Terminal B (Research specialist)
│   │   │   ├── debug.rs         # Terminal C (Debug specialist)
│   │   │   └── build.rs         # Terminal D (Build specialist)
│   │   ├── memory/              # Fixed memory system
│   │   │   ├── mod.rs
│   │   │   ├── store.rs         # Persistent storage
│   │   │   └── knowledge.rs     # Knowledge base management
│   │   ├── voice/               # Voice interface
│   │   │   ├── mod.rs
│   │   │   ├── recognizer.rs    # Speech-to-text
│   │   │   └── wake_word.rs     # Wake word detection
│   │   ├── permissions/         # Permission system
│   │   │   ├── mod.rs
│   │   │   ├── request.rs       # Permission request structure
│   │   │   └── policy.rs        # Policy engine
│   │   └── agents/              # Agent reasoning loop
│   │       ├── mod.rs
│   │       ├── thinker.rs       # Core reasoning engine
│   │       └── planner.rs       # Task decomposition
│   ├── Cargo.toml
│   └── tauri.conf.json
│
├── src/
│   ├── components/
│   │   ├── TerminalPanel.tsx    # Individual terminal view
│   │   ├── TerminalGrid.tsx     # Multi-terminal layout
│   │   ├── PermissionDialog.tsx # Permission approval flow
│   │   ├── VoiceInput.tsx       # Voice command interface
│   │   ├── AgentStatus.tsx      # Real-time status display
│   │   └── MemoryView.tsx       # View terminal memory
│   ├── hooks/
│   │   ├── useTerminals.ts
│   │   ├── usePermissions.ts
│   │   └── useVoice.ts
│   └── lib/
│       ├── orchestration.ts
│       └── api.ts
│
└── data/
    └── memories/                # Fixed memory storage per terminal
        ├── terminal_a_ui_ux.json
        ├── terminal_b_research.json
        ├── terminal_c_debug.json
        └── terminal_d_build.json
```

---

## 🔄 How It Works (User Flow)

### Step 1: User Speaks/Gives Task
```
You: "Terminal A, build the login page. Terminal B, research auth patterns. 
      Terminal C, check for security issues. Terminal D, prepare deployment."
```

### Step 2: Each Terminal THINKS Independently
```
Terminal A (UI/UX):
  → Reads existing design system
  → Plans login page structure
  → Asks: "Should I use existing button component or create new?"

Terminal B (Research):
  → Searches documentation
  → Analyzes authentication methods
  → Asks: "Found OAuth, JWT, Session options. Which do you prefer?"

Terminal C (Debug):
  → Scans for vulnerability patterns
  → Checks dependency versions
  → Asks: "Found 2 outdated packages. Update now?"

Terminal D (Build):
  → Reviews Dockerfiles
  → Checks CI/CD configs
  → Asks: "Ready to build. Run tests first?"
```

### Step 3: User Reviews and Approves
```
You: "A - use existing components. B - go with JWT. C - update packages. 
      D - run tests then build."
```

### Step 4: Terminals Execute (With Ongoing Communication)
```
Terminal A → builds login page → shows preview
Terminal B → implements JWT auth → reports progress
Terminal C → updates dependencies → flags conflicts
Terminal D → runs tests → reports 98% pass rate
```

### Step 5: Completion Report
```
All terminals report completion.
You see: "Login page ready. Auth implemented. Dependencies updated. Tests passing."
```

---

## 🔐 Permission System

### Permission Types
```rust
enum PermissionType {
    ReadFile(PathBuf),
    WriteFile(PathBuf),
    EditFile(PathBuf, Vec<Change>),
    RunCommand(String),
    NpmInstall(Vec<String>),
    GitOperation(GitOp),
    NetworkRequest(String),
    SystemChange(String),
    DeleteFile(PathBuf),
    ExecuteBinary(PathBuf),
}

enum Urgency {
    Low,      // Can wait, batch with other requests
    Medium,   // Standard approval needed
    High,     // Immediate approval, timeout = deny
    Critical, // Auto-approve if trusted terminal
}
```

### Permission Flow
```
Terminal needs permission
        │
        ▼
Creates PermissionRequest
        │
        ▼
Shows notification to user
        │
        ├─→ User APPROVES ──▶ Execute action
        │
        ├─→ User DENIES ────▶ Log denial, ask alternative
        │
        └─→ User DOESN'T RESPOND ──▶ Timeout based on urgency
```

---

## 🧠 Fixed Memory System

### Memory Structure
```rust
#[derive(Serialize, Deserialize)]
struct TerminalMemory {
    terminal_id: String,
    expertise: ExpertiseArea,
    created_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
    
    // Core knowledge
    knowledge_base: Vec<KnowledgeEntry>,
    
    // Project-specific context
    project_context: ProjectContext,
    
    // Past interactions (for learning)
    past_interactions: Vec<Interaction>,
    
    // User preferences
    preferences: UserPreferences,
    
    // Performance metrics
    stats: AgentStats,
}

#[derive(Serialize, Deserialize)]
struct KnowledgeEntry {
    topic: String,
    content: String,
    confidence: f32,        // 0.0 to 1.0
    source: String,         // "documentation", "code_analysis", "user_input"
    created_at: DateTime<Utc>,
    last_used: DateTime<Utc>,
    usage_count: u32,
}
```

### Memory Persistence
- Stored as JSON files in `data/memory/terminal_<id>.json`
- Auto-saves after every interaction
- Versioned backups in `data/memory/backups/`
- Syncs across projects via optional cloud backup (future)

---

## 🎤 Voice Integration

### Stack
- **Vosk** (local speech recognition, offline)
- **OpenAI Whisper** (cloud fallback for accuracy)
- **Custom wake word detection** ("Terminal" or custom word)

### Voice Commands
```
"Hey Terminal, wake up"
"Terminal A, build the login page"
"Terminal B, what are the latest React patterns?"
"Terminal C, find security issues in src/"
"Terminal D, deploy to staging"
"Show me all terminals"
"Pause all terminals"
"Terminal A, what did you work on yesterday?"
```

---

## 💰 Budget (Paid Tools Only)

| Tool | Purpose | Estimated Cost |
|------|---------|----------------|
| OpenAI API (GPT-4o) | General reasoning | ~$50-100/month |
| Anthropic API (Claude) | Complex reasoning | ~$50-100/month |
| Vercel Pro | Hosting (if needed) | $20/month |
| Domain + DNS | If publishing | $12/year |
| **Total Monthly** | | **~$120-220/month** |

**Note:** Fixed memory runs locally, so most processing is local. API calls are only for complex reasoning tasks.

---

## 🚀 Development Phases

### Phase 1: Foundation (2 weeks)
- [ ] Set up Rust project structure
- [ ] Build terminal manager (spawn/kill/monitor)
- [ ] Implement fixed memory storage
- [ ] Create basic permission system
- [ ] Build simple React UI

### Phase 2: Agent Intelligence (3 weeks)
- [ ] Implement reasoning loop
- [ ] Add proactive error detection
- [ ] Build task decomposition
- [ ] Create inter-terminal communication
- [ ] Integrate voice recognition

### Phase 3: UX Polish (2 weeks)
- [ ] Beautiful multi-terminal layout
- [ ] Real-time status updates
- [ ] Permission approval flow
- [ ] Voice command interface
- [ ] Memory visualization

### Phase 4: Advanced Features (ongoing)
- [ ] Learning from past interactions
- [ ] Terminal-to-terminal handoffs
- [ ] Custom agent specialization
- [ ] Team collaboration features
- [ ] Performance optimization

---

## 🎯 Success Metrics

| Metric | Target |
|--------|--------|
| Terminal response time | < 2 seconds |
| Permission approval rate | > 90% (after review) |
| Task completion rate | > 85% without human intervention |
| Error prediction accuracy | > 80% (catches errors before they happen) |
| User satisfaction | > 4.5/5 |

---

## 🆚 Competitive Analysis

| Product | What It Does | Why Ours Is Better |
|---------|-------------|-------------------|
| **Claude Code** | Single AI coding assistant | We have MULTIPLE specialized agents |
| **Cursor** | AI-powered IDE | We have FIXED MEMORY + PROACTIVE behavior |
| **Devin** | Autonomous AI engineer | We're LOCAL-FIRST, no cloud dependency |
| **AutoGPT** | Autonomous agent | We have PERMISSION control + SPECIALIZATION |
| **OpenCode** | Basic terminal automation | We have VOCAL interface + MULTIPLE agents |

---

## 💡 Future Extensions

1. **Terminal Teams** — Group terminals for collaborative projects
2. **Marketplace** — Share/download terminal specializations
3. **Cloud Sync** — Optional cloud backup for memory
4. **Mobile App** — Control terminals from phone
5. **Plugin System** — Community-built terminal agents
6. **Enterprise Mode** — Team collaboration, audit logs

---

## 📝 Next Steps (When Ready to Build)

1. [ ] Initialize Rust project with Tauri
2. [ ] Set up MLX environment for local inference
3. [ ] Build core orchestrator
4. [ ] Create first terminal agent (Terminal A - UI/UX)
5. [ ] Test permission system
6. [ ] Add voice interface
7. [ ] Polish UI
8. [ ] Beta test with real users
9. [ ] Launch

---

**Built by:** Kenneth Aman  
**Project:** DWO Ecosystem — Terminal Agents  
**Date Created:** 2026-09-23  
**Last Updated:** 2026-09-23
