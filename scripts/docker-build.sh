#!/bin/bash
# ─── DWO Docker Helper Script ────────────────────────────────────────────────
#
# Quick commands for building and running DWO via Docker.
#
# Usage:
#   ./scripts/docker-build.sh web       # build web image
#   ./scripts/docker-build.sh dev       # start dev container
#   ./scripts/docker-build.sh native    # build native binary (Linux host only)
#   ./scripts/docker-build.sh logs      # show container logs
#   ./scripts/docker-build.sh stop      # stop all containers
#   ./scripts/docker-build.sh clean     # remove images and volumes

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
IMAGE_TAG="${DWO_IMAGE_TAG:-dwo}"

cd "$PROJECT_ROOT"

cmd="${1:-help}"

case "$cmd" in
  web)
    echo "🔨 Building web image..."
    docker build -t "$IMAGE_TAG:web" -f Dockerfile --target runtime .
    echo "✅ Web image built: $IMAGE_TAG:web"
    ;;

  dev)
    echo "🚀 Starting dev environment..."
    docker compose -f docker-compose.dev.yml up
    ;;

  native)
    if [[ "$(uname)" != "Linux" ]]; then
      echo "⚠️  Native build requires a Linux host. Consider using CI instead."
      echo "   GitHub Actions will build the .exe automatically on push to a tag."
      exit 1
    fi
    echo "🔨 Building native Tauri binary..."
    docker build -t "$IMAGE_TAG:builder" -f Dockerfile --target builder .
    echo "📦 Extracting bundle..."
    docker run --rm -v "$PROJECT_ROOT/src-tauri/target/release/bundle:/out" "$IMAGE_TAG:builder" \
      cp -r /app/src-tauri/target/release/bundle/* /out/
    echo "✅ Native bundles extracted to src-tauri/target/release/bundle/"
    ls -lh src-tauri/target/release/bundle/
    ;;

  run-web)
    echo "🌐 Running web mode on http://localhost:${DWO_PORT:-3000} ..."
    docker compose up -d
    echo "   Open http://localhost:${DWO_PORT:-3000}"
    echo "   Logs: docker compose logs -f dwo"
    ;;

  stop)
    echo "🛑 Stopping containers..."
    docker compose down
    docker compose -f docker-compose.dev.yml down 2>/dev/null || true
    ;;

  logs)
    docker compose logs -f dwo 2>/dev/null || docker compose -f docker-compose.dev.yml logs -f dwo-dev
    ;;

  clean)
    echo "🧹 Cleaning Docker artifacts..."
    docker compose down --remove-orphans
    docker compose -f docker-compose.dev.yml down --remove-orphans 2>/dev/null || true
    docker image prune -f --filter "label!=org.opencontainers.image.source" 2>/dev/null || true
    docker volume prune -f
    echo "✅ Cleaned"
    ;;

  help|*)
    echo ""
    echo "DWO Docker Helper"
    echo "================="
    echo ""
    echo "  ./scripts/docker-build.sh web      Build the web image"
    echo "  ./scripts/docker-build.sh dev      Start dev mode (hot-reload)"
    echo "  ./scripts/docker-build.sh native   Build native binary (Linux only)"
    echo "  ./scripts/docker-build.sh run-web  Build and run web mode"
    echo "  ./scripts/docker-build.sh logs     Follow container logs"
    echo "  ./scripts/docker-build.sh stop     Stop all containers"
    echo "  ./scripts/docker-build.sh clean    Remove images and volumes"
    echo ""
    echo "Environment variables:"
    echo "  DWO_PORT        Host port (default: 3000)"
    echo "  DWO_IMAGE_TAG   Docker image tag prefix (default: dwo)"
    echo ""
    ;;
esac
