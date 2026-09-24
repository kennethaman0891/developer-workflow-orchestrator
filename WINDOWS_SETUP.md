# DWO on Windows — Docker Quick Start

## Prerequisites

### 1. Install Docker Desktop for Windows

Download from: https://docs.docker.com/desktop/install/windows-install/

During installation:
- ✅ Enable **WSL 2 backend** (recommended)
- ✅ Enable **GPU acceleration** (optional, for native builds)
- ✅ Add shortcut to Desktop (optional)

### 2. Verify Installation

Open **PowerShell** and run:

```powershell
docker --version
docker compose version
```

You should see version numbers, not errors. If you get `command not found`, restart PowerShell.

---

## Option 1: Web Mode (Fastest — No Rust or Node.js needed)

This runs DWO in your browser. Terminal features are limited but the editor, file browser, and settings work.

```powershell
# Clone the repo (if you haven't already)
git clone https://github.com/kennethaman/dwo.git
cd dwo

# Build and start
docker compose up -d

# Open in your browser
Start-Process "http://localhost:3000"
```

**Stop when done:**
```powershell
docker compose down
```

---

## Option 2: Native App (Full Features)

The native Tauri app gives you full terminal emulation, file system access, and agent orchestration.

### Via GitHub Releases (easiest)

1. Go to https://github.com/kennethaman/dwo/releases
2. Download `DWO-Setup-2.0.0.exe`
3. Double-click to install
4. Run DWO from Start Menu

### Via Local Build (requires Linux build machine or WSL2 with full toolchain)

```powershell
# You need a Linux environment with Rust + Node.js installed
# This is complex — the GitHub Release above is recommended
./scripts/docker-build.sh native
```

---

## Common Commands

| Command | What it does |
|---------|-------------|
| `docker compose up -d` | Start web mode in background |
| `docker compose logs -f dwo` | View logs |
| `docker compose down` | Stop and remove containers |
| `docker compose ps` | Check running containers |
| `docker images` | List downloaded images |
| `docker system prune -a` | Free disk space (removes all unused images) |

---

## Troubleshooting

### "docker: command not found"
Restart PowerShell or open a new terminal window. Docker Desktop adds itself to PATH on first launch.

### Port 3000 already in use
```powershell
$env:DWO_PORT = "3001"
docker compose up -d
# Then open http://localhost:3001
```

### WSL 2 not enabled
```powershell
# Check if WSL is installed
wsl --list --verbose

# If not, install it
wsl --install
```

### Docker Desktop won't start
- Make sure Virtual Machine Platform is enabled (Windows Features)
- Restart your computer after enabling it

---

## What Works in Web Mode vs Native

| Feature | Web Mode (Docker) | Native App |
|---------|------------------|------------|
| Code Editor | ✅ | ✅ |
| File Browser | ✅ | ✅ |
| Git Integration | ❌ | ✅ |
| Terminal Sessions | Limited | ✅ Full PTY |
| Agent Orchestration | Limited | ✅ Full |
| Multi-window Layout | ✅ | ✅ |
| Plugin System | ❌ | ✅ |
| Voice Interface | ❌ | ✅ |

For full functionality, use the native .exe from GitHub Releases.
