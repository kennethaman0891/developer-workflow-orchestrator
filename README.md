# DWO — Developer Workflow Orchestrator

<div align="center">

![DWO Logo](public/logo.png)

**A powerful desktop application for managing developer workflows with multi-agent terminal orchestration.**

[![Version](https://img.shields.io/badge/version-2.0.0-blue.svg)](#)
[![License](https://img.shields.io/badge/license-MIT%20OR%20Apache--2.0-blue.svg)](LICENSE-MIT)
[![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows-lightgrey.svg)](#)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react)](#)
[![Tauri](https://img.shields.io/badge/Tauri-2.0-24C8D8?logo=tauri)](#)
[![Rust](https://img.shields.io/badge/Rust-1.75+-dea584?logo=rust)](#)

</div>

## 🚀 What is DWO?

DWO (Developer Workflow Orchestrator) is a cross-platform desktop application built with **Tauri** and **Next.js** that provides developers with a unified workspace for managing multiple terminals, running distributed AI agents, and automating complex development workflows.

### ✨ Key Features

- **Multi-Terminal Management** — Run and monitor multiple terminal sessions in one window with full xterm.js support
- **Agent Orchestration** — Distribute tasks across multiple AI agents for parallel execution and coordinated workflows
- **Code Editor** — Built-in syntax-highlighted code editor supporting JavaScript, Python, HTML, CSS, and JSON via CodeMirror 6
- **Git Integration** — Seamless version control operations directly from the interface
- **File System Operations** — Browse, manage, and manipulate files with an integrated file explorer
- **Cross-Platform** — Native performance on macOS, Windows, and Linux using Tauri's lightweight runtime

### 🎯 Use Cases

- **Development Workflows** — Coordinate multiple terminal sessions for complex builds and deployments
- **AI-Assisted Development** — Leverage distributed AI agents to automate coding tasks
- **System Administration** — Manage remote servers and local environments from a single interface
- **Team Collaboration** — Streamline collaborative development with shared workspace management

## 🛠️ Tech Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| UI Framework | [Next.js 15](https://nextjs.org/) + React 19 | Modern web interface |
| Desktop Runtime | [Tauri v2](https://tauri.app/) | Native cross-platform packaging |
| Backend Language | [Rust](https://www.rust-lang.org/) | High-performance native operations |
| Terminal Emulator | [xterm.js](https://xtermjs.org/) | Feature-rich terminal sessions |
| Code Editor | [CodeMirror 6](https://codemirror.net/) | Syntax highlighting & editing |
| Language Support | JS, Python, HTML, CSS, JSON | Multiple language syntax highlighting |

## 📦 Installation

### Prerequisites

- Node.js 20+
- Rust 1.75+ toolchain
- Xcode command line tools (macOS only)

### Quick Start

```bash
# Clone the repository
git clone https://github.com/kennethaman0891/developer-workflow-orchestrator.git
cd developer-workflow-orchestrator

# Install npm dependencies
npm install

# Install Tauri CLI globally
npm install -g @tauri-apps/cli
```

## 🏃 Development

```bash
# Run in development mode with hot reload
npx tauri dev

# Type check TypeScript
npm run typecheck

# Lint code
npm run lint

# Format code
npm run format
```

## 📦 Build for Production

```bash
# Build Next.js app
npm run build

# Export static site
npm run export

# Create distributable desktop package
npx tauri build
```

### Output Locations

| Platform | Path |
|----------|------|
| macOS | `src-tauri/target/release/bundle/macos/` |
| Windows | `src-tauri/target/release/bundle/msi/` |
| Linux | `src-tauri/target/release/bundle/appimage/` |

## 📁 Project Structure

```
developer-workflow-orchestrator/
├── app/                      # Next.js App Router
│   ├── layout.tsx           # Root layout component
│   ├── page.tsx             # Main application page
│   └── global-error.tsx     # Error boundary
├── src/                     # Frontend source code
│   ├── agents/              # Agent orchestration logic
│   ├── events/              # Event handling system
│   ├── fs/                  # File system operations
│   ├── git/                 # Git integration
│   ├── license/             # License management
│   ├── plugins/             # Plugin system
│   ├── state/               # State management
│   ├── tasks/               # Task coordination
│   └── terminal/            # Terminal session management
├── src-tauri/              # Rust backend
│   ├── src/
│   │   ├── lib.rs           # Core library (10.1 KB)
│   │   └── main.rs          # Application entry point
│   ├── Cargo.toml           # Rust dependencies
│   ├── Cargo.lock           # Dependency lockfile
│   ├── build.rs             # Build script
│   └── tauri.conf.json      # Tauri configuration
├── public/                  # Static assets
│   └── logo.png             # Application logo
├── package.json             # NPM dependencies
├── tsconfig.json            # TypeScript configuration
└── next.config.ts           # Next.js configuration
```

## 🔧 Configuration

### Environment Variables

Create a `.env.local` file based on `.env.example`:

```bash
# Copy environment template
cp .env.example .env.local
```

### Tauri Configuration

Edit `src-tauri/tauri.conf.json` to customize:
- Window size and position
- Application name and version
- Platform-specific settings
- Security policies

## 📄 License

DWO is dual-licensed under **either**:

- **MIT License** — see [LICENSE-MIT](LICENSE-MIT)
- **Apache License, Version 2.0** — see [LICENSE-APACHE](LICENSE-APACHE)

You may choose which license to use, at your option.

The application additionally operates under a tiered functional model:

- **Free Tier**: 4 terminals, 2 workspaces
- **Pro Tier**: 10 terminals, 50 workspaces

## 🤝 Contributing

Contributions are welcome! Please follow these guidelines:

1. **Fork** the repository
2. **Create** a feature branch (`git checkout -b feature/AmazingFeature`)
3. **Commit** your changes (`git commit -m 'Add some AmazingFeature'`)
4. **Push** to the branch (`git push origin feature/AmazingFeature`)
5. **Open** a Pull Request

### Development Guidelines

- Follow the existing code style (see `.eslintrc` and Prettier config)
- Add tests for new features
- Update documentation as needed
- Ensure all CI checks pass

## 🔗 Links

- **[GitHub Repository](https://github.com/kennethaman0891/developer-workflow-orchestrator)** — Source code and issues
- **[Releases](https://github.com/kennethaman0891/developer-workflow-orchestrator/releases)** — Download latest builds
- **[Issues](https://github.com/kennethaman0891/developer-workflow-orchestrator/issues)** — Report bugs or request features

---

<div align="center">

Made with ❤️ by [kennethaman0891](https://github.com/kennethaman0891)

</div>
