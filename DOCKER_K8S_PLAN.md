# DWO — Docker & Kubernetes Deployment Plan

**Status:** Draft  
**Priority:** High  
**Target Users:** Windows developers (primary), all platforms  
**Build Timeline:** Phased rollout over 2 weeks

---

## 🎯 Vision Statement

Provide Windows users with a one-command, zero-hassle way to run DWO — either as a native desktop app (built in Docker) or as a browser-accessible web app (docker-compose up). Eliminate the need to install Rust toolchain, Node.js, or build tools locally on Windows.

---

## 🏗️ Architecture Options

### Option A: Docker-Based Native Build (Primary)
Build the Tauri desktop binary inside Docker, distribute the result. Windows users download the `.msi`/`.exe` and run natively.

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Developer      │     │  Docker Build    │     │  Windows User   │
│  (Linux/macOS)  │ ──▶ │  Container       │ ──▶ │  Downloads .exe │
│                 │     │  - rustup        │     │  Runs natively  │
│  (or same CI)   │     │  - cargo         │     │  No Docker      │
│                 │     │  - tauri build   │     │  required       │
└─────────────────┘     └──────────────────┘     └─────────────────┘
```

### Option B: Docker Compose — Web-Only Mode (Developer/Quick Start)
Run the full app in a browser via Docker. The static Next.js export serves from nginx, and the Tauri backend runs as a companion service.

```
┌──────────────────────────────────────────────────────┐
│                 Docker Compose                        │
│                                                       │
│  ┌─────────────┐     ┌─────────────┐                 │
│  │  nginx      │     │  dwo-api    │                 │
│  │  :3000      │────▶│  :8080      │                 │
│  │  (static    │     │  (Rust      │                 │
│  │   Next.js)  │     │   backend)  │                 │
│  └─────────────┘     └─────────────┘                 │
│                                                       │
│  volume: dwo-data → /app/data                         │
└──────────────────────────────────────────────────────┘
```

### Option C: Kubernetes (Future — Agent Orchestrator Backend)
If/when DWO adds a cloud-hosted agent orchestration layer, K8s provides auto-scaling, self-healing, and multi-region deployment.

```
┌─────────────────────────────────────────────────────────────┐
│                    Kubernetes Cluster                        │
│                                                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐                  │
│  │ Web API  │  │ Agent    │  │ Worker   │                  │
│  │ Pod × 2  │  │ Pod × N  │  │ Pod × M  │                  │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘                  │
│       │             │             │                         │
│  ┌────▼─────────────▼─────────────▼─────┐                   │
│  │           Service + Ingress           │                   │
│  └───────────────────┬───────────────────┘                   │
│                       │                                       │
│  ┌────────────────────▼───────────────────┐                  │
│  │          Persistent Volume (state)      │                  │
│  └─────────────────────────────────────────┘                  │
└─────────────────────────────────────────────────────────────┘
```

---

## 📦 Deliverables

| # | File | Purpose | Phase |
|---|------|---------|-------|
| 1 | `Dockerfile` | Multi-stage build for production binary | Phase 1 |
| 2 | `Dockerfile.dev` | Development image with hot-reload | Phase 1 |
| 3 | `docker-compose.yml` | Local dev + web-mode deployment | Phase 1 |
| 4 | `docker-compose.prod.yml` | Production web-mode with nginx | Phase 2 |
| 5 | `.dockerignore` | Optimized build context | Phase 1 |
| 6 | `k8s/` directory | Kubernetes manifests (future) | Phase 3 |
| 7 | `WINDOWS_SETUP.md` | Windows user guide | Phase 1 |
| 8 | GitHub Actions workflow | Automated builds & releases | Phase 2 |

---

## 🚀 Phase 1: Docker — Immediate Value (Week 1)

### 1.1 Production Dockerfile (`Dockerfile`)

Multi-stage build that produces a static web export + a minimal runtime container.

```dockerfile
# ─── Stage 1: Build frontend ───
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --prefer-offline
COPY . .
RUN npm run build

# ─── Stage 2: Runtime (web-only mode) ───
FROM nginx:alpine AS runtime
# Copy built static files
COPY --from=builder /app/out /usr/share/nginx/html
# Custom nginx config for SPA + API proxy
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 3000
CMD ["nginx", "-g", "daemon off;"]
```

**What this gives Windows users:**
```bash
# One command to run the web version
docker compose up
# Open http://localhost:3000
```

### 1.2 Dev Dockerfile (`Dockerfile.dev`)

Hot-reload enabled for active development.

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
# Mount source for hot-reload
VOLUME ["/app/src", "/app/app"]
EXPOSE 3000
CMD ["npm", "run", "dev"]
```

### 1.3 Docker Compose (`docker-compose.yml`)

```yaml
version: '3.8'

services:
  dwo:
    build:
      context: .
      dockerfile: Dockerfile
    ports:
      - "3000:3000"
    volumes:
      - dwo-data:/data
    environment:
      - NODE_ENV=production

volumes:
  dwo-data:
```

### 1.4 `.dockerignore`

```
node_modules
.next
out
src-tauri/target
src-tauri/gen
.git
.env
data/
*.log
.freebuff
.fcl
```

### 1.5 Windows Quick-Start Guide (`WINDOWS_SETUP.md`)

```markdown
# Running DWO on Windows via Docker

## Prerequisites
1. Install [Docker Desktop for Windows](https://docs.docker.com/desktop/install/windows-install/)
   - Ensure WSL 2 backend is enabled
2. Verify installation:
   ```powershell
   docker --version
   docker compose version
   ```

## Option 1: Web Version (Recommended for quick start)
```powershell
cd C:\path\to\dwo
docker compose up -d
# Open http://localhost:3000 in your browser
```

## Option 2: Native Build (Requires Linux/macOS build machine or CI)
The native Tauri .exe is built in CI and available in GitHub Releases.
Download `DWO-Setup-2.0.0.exe` and run directly — no Docker needed.
```

---

## 🔄 Phase 2: CI/CD Builds (Week 2)

### 2.1 GitHub Actions Workflow (`.github/workflows/build.yml`)

```yaml
name: Build & Release

on:
  push:
    tags: ['v*']
  workflow_dispatch:

jobs:
  build-web:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - run: npm run build
      - uses: actions/upload-artifact@v4
        with:
          name: dwo-web
          path: out/

  build-native-windows:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4
      - uses: dtolnay/rust-toolchain@stable
      - run: npm ci
      - run: npm run tauri build
      - uses: actions/upload-artifact@v4
        with:
          name: dwo-windows
          path: src-tauri/target/release/bundle/

  release:
    needs: [build-web, build-native-windows]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/download-artifact@v4
      # Create GitHub Release with assets
```

### 2.2 Docker Push to GitHub Container Registry

```yaml
# Added to build workflow
- uses: docker/login-action@v3
  with:
    registry: ghcr.io
    username: ${{ github.actor }}
    password: ${{ secrets.GITHUB_TOKEN }}
- uses: docker/build-push-action@v5
  with:
    context: .
    push: true
    tags: ghcr.io/${{ github.repository }}:${{ github.ref_name }}
```

---

## ☸️ Phase 3: Kubernetes (Future — When Cloud Backend Exists)

Kubernetes becomes valuable when DWO adds:
- A remote agent orchestration API
- Multi-user collaboration features
- Cloud-synced state

### 3.1 Base Manifests (`k8s/base/`)

```
k8s/
├── base/
│   ├── deployment.yaml
│   ├── service.yaml
│   └── kustomization.yaml
├── overlays/
│   ├── dev/
│   │   └── kustomization.yaml
│   └── prod/
│       └── kustomization.yaml
└── ingress.yaml
```

### 3.2 Sample Deployment (`k8s/base/deployment.yaml`)

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: dwo
spec:
  replicas: 2
  selector:
    matchLabels:
      app: dwo
  template:
    metadata:
      labels:
        app: dwo
    spec:
      containers:
        - name: dwo
          image: ghcr.io/kennethaman/dwo:latest
          ports:
            - containerPort: 3000
          env:
            - name: NODE_ENV
              value: "production"
            - name: DWO_DATA_DIR
              value: "/data"
          volumeMounts:
            - name: data
              mountPath: /data
      volumes:
        - name: data
          persistentVolumeClaim:
            claimName: dwo-pvc
```

### 3.3 Sample Service (`k8s/base/service.yaml`)

```yaml
apiVersion: v1
kind: Service
metadata:
  name: dwo
spec:
  selector:
    app: dwo
  ports:
    - port: 3000
      targetPort: 3000
  type: ClusterIP
```

### 3.4 Ingress (`k8s/ingress.yaml`)

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: dwo
  annotations:
    nginx.ingress.kubernetes.io/rewrite-target: /
spec:
  rules:
    - host: dwo.example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: dwo
                port:
                  number: 3000
```

### 3.5 Kustomization Overlays

**Dev** (`k8s/overlays/dev/kustomization.yaml`):
```yaml
bases:
  - ../../base
namespace: dwo-dev
patches:
  - target:
      kind: Deployment
      name: dwo
    patch: |
      - op: replace
        path: /spec/replicas
        value: 1
```

**Prod** (`k8s/overlays/prod/kustomization.yaml`):
```yaml
bases:
  - ../../base
namespace: dwo-prod
patches:
  - target:
      kind: Deployment
      name: dwo
    patch: |
      - op: replace
        path: /spec/replicas
        value: 3
```

---

## 🔧 Additional Docker Utilities

### 1. Docker Compose for Local Dev (with hot-reload)

```yaml
version: '3.8'

services:
  dwo-dev:
    build:
      context: .
      dockerfile: Dockerfile.dev
    ports:
      - "3000:3000"
    volumes:
      - .:/app
      - /app/node_modules
      - /app/.next
    environment:
      - NODE_ENV=development
    command: npm run dev
```

### 2. Docker Compose for Native Build (cross-platform)

```yaml
version: '3.8'

services:
  build:
    image: ghcr.io/tauri-apps/tauri-ci:latest
    volumes:
      - .:/workspace
    working_dir: /workspace
    command: sh -c "npm ci && npm run tauri build"
```

### 3. Helper Script (`scripts/docker-build.sh`)

```bash
#!/bin/bash
set -e

case "${1:-web}" in
  web)
    echo "Building web version..."
    docker build -t dwo:web .
    ;;
  dev)
    echo "Starting dev environment..."
    docker compose -f docker-compose.dev.yml up
    ;;
  native)
    echo "Building native binary (requires Linux)...  "
    docker build -t dwo-builder -f Dockerfile.builder .
    ;;
  *)
    echo "Usage: $0 {web|dev|native}"
    exit 1
    ;;
esac
```

---

## 📋 Implementation Checklist

### Phase 1 — Core Docker (Days 1-3)
- [ ] Create `Dockerfile` (multi-stage, production)
- [ ] Create `Dockerfile.dev` (development with hot-reload)
- [ ] Create `docker-compose.yml` (web mode)
- [ ] Create `docker-compose.dev.yml` (dev mode)
- [ ] Create `.dockerignore`
- [ ] Write `WINDOWS_SETUP.md`
- [ ] Test on Windows via Docker Desktop

### Phase 2 — CI/CD & Publishing (Days 4-7)
- [ ] Create `.github/workflows/build.yml`
- [ ] Add Docker push to GHCR
- [ ] Automate image tagging (semantic versioning)
- [ ] Update README with Docker quickstart

### Phase 3 — Kubernetes (Days 8-14, future)
- [ ] Design cloud backend architecture (if needed)
- [ ] Create `k8s/` manifest structure
- [ ] Implement stateful persistence strategy
- [ ] Add HPA (Horizontal Pod Autoscaler) config
- [ ] Set up monitoring (Prometheus/Grafana optional)

---

## ⚠️ Known Considerations for Windows

1. **WSL 2 Required**: Docker Desktop on Windows requires WSL 2 backend
2. **Terminal Emulation**: The native Tauri app uses `portable-pty` for real PTY sessions. The web-only mode won't have full terminal emulation — this is acceptable for initial access but limits functionality
3. **File System Access**: Web mode has restricted file system access compared to native
4. **Build Environment**: Native Tauri builds require Windows SDK + Rust toolchain; best done in CI, not locally on every developer machine

---

## 🚦 Success Metrics

| Metric | Target |
|--------|--------|
| Windows users able to run via Docker | < 10 minutes from clone to first screen |
| Docker image size (web mode) | < 200 MB |
| Build time (CI) | < 10 minutes |
| Windows native .exe distribution | Available via GitHub Releases |

---

## 📚 References

- [Tauri v2 Docker Guide](https://tauri.app/v1/guides/building/docker/)
- [Next.js Docker Best Practices](https://nextjs.org/docs/pages/building-your-application/deploying/docker)
- [GitHub Actions for Rust](https://github.com/dtolnay/rust-toolchain)
- [Kubernetes Official Docs](https://kubernetes.io/docs/)