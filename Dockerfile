# ─── DWO Production Dockerfile ────────────────────────────────────────────────
#
# Two variants are available:
#   WEB     — serves the static Next.js export in nginx (no Tauri runtime).
#             Good for quick browser access, limited terminal capabilities.
#   NATIVE  — builds the full Tauri app inside Docker and produces a binary.
#             Requires Linux build environment; intended for CI.
#
# Usage:
#   docker build -t dwo:web      -f Dockerfile      --target web      .
#   docker build -t dwo:web      -f Dockerfile      --target runtime  .
#   docker build -t dwo:builder  -f Dockerfile      --target builder  .
#   docker build -t dwo:native   -f Dockerfile.native .                # standalone native build

# ── Stage 1: Common frontend build (shared by both web and native) ────────────
FROM node:20-alpine AS node-base
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --prefer-offline --no-audit --no-fund
COPY . .

# ── Stage 2a: Web-only runtime (nginx serving static export) ──────────────────
FROM node-base AS web
RUN npm run build
FROM nginx:alpine AS runtime
LABEL maintainer="kennethaman"
LABEL org.opencontainers.image.source="https://github.com/kennethaman/dwo"

# Copy built static assets
COPY --from=web /app/out /usr/share/nginx/html

# Custom nginx config (see nginx.conf)
COPY nginx.standalone.conf /etc/nginx/conf.d/default.conf

EXPOSE 3000
ENV NODE_ENV=production
CMD ["nginx", "-g", "daemon off;"]

# ── Stage 2b: Native Tauri build (CI only — requires Linux + cross-tools) ────
FROM rust:1.85-slim AS builder
LABEL maintainer="kennethaman"

RUN apt-get update && apt-get install -y \
      curl \
      git \
      ca-certificates \
      build-essential \
      libssl-dev \
      pkg-config \
      libgtk-3-dev \
      libwebkit2gtk-4.1-dev \
      libayatana-appindicator3-dev \
      librsvg2-dev \
      libsoup-3.0-dev \
      libjavascriptcoregtk-4.1-dev \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js 20
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --prefer-offline --no-audit --no-fund
COPY . .

# Build Next.js static export (needed by Tauri bundle)
RUN npm run build

# Build Tauri binary
RUN npm run tauri build -- --verbose

# Output goes to src-tauri/target/release/bundle/
RUN ls -la src-tauri/target/release/bundle/

# ── Stage 3: Native output (copy for easy extraction) ────────────────────────
FROM scratch AS native-output
COPY --from=builder /app/src-tauri/target/release/bundle/ /bundle/
