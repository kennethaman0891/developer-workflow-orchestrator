#!/bin/bash
set -e

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SOURCE_APP="$REPO_DIR/src-tauri/target/release/bundle/macos/DWO.app"

if [ ! -d "$SOURCE_APP" ]; then
    echo "[install-app] Error: Built app bundle not found at $SOURCE_APP"
    echo "[install-app] Run 'npm run tauri:build' first."
    exit 1
fi

echo "[install-app] Installing DWO.app from: $SOURCE_APP"

# 1. Clean corrupted or stale user application bundle
if [ -d "$HOME/Applications/DWO.app" ]; then
    echo "[install-app] Removing old $HOME/Applications/DWO.app..."
    rm -rf "$HOME/Applications/DWO.app"
fi

mkdir -p "$HOME/Applications"
echo "[install-app] Copying to $HOME/Applications/DWO.app..."
cp -R "$SOURCE_APP" "$HOME/Applications/DWO.app"

# 2. Update /Applications/DWO.app if accessible
if [ -w "/Applications" ] || [ -w "/Applications/DWO.app" ]; then
    echo "[install-app] Updating /Applications/DWO.app..."
    rm -rf "/Applications/DWO.app"
    cp -R "$SOURCE_APP" "/Applications/DWO.app"
fi

# 3. Re-seal the ad-hoc signature on the installed copies.
#    The bundle tauri produces is linker-signed ad-hoc, which `codesign -v`
#    flags with "code has no resources but signature indicates they must be
#    present". Re-signing locally seals it properly so verification passes.
if command -v codesign >/dev/null 2>&1; then
    echo "[install-app] Re-signing installed app (ad-hoc)..."
    codesign --force -s - "$HOME/Applications/DWO.app" 2>/dev/null || true
    if [ -d "/Applications/DWO.app" ]; then
        codesign --force -s - "/Applications/DWO.app" 2>/dev/null || true
    fi
fi

# 4. Refresh LaunchServices registration
LSREGISTER="/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister"
if [ -f "$LSREGISTER" ]; then
    echo "[install-app] Refreshing LaunchServices registration..."
    "$LSREGISTER" -f "$HOME/Applications/DWO.app" 2>/dev/null || true
    if [ -d "/Applications/DWO.app" ]; then
        "$LSREGISTER" -f "/Applications/DWO.app" 2>/dev/null || true
    fi
fi

# 5. Clear WKWebView cache so stale static assets are never loaded
if [ -d "$HOME/Library/Caches/com.kennethaman.dwo" ]; then
    echo "[install-app] Purging WebKit cache for com.kennethaman.dwo..."
    rm -rf "$HOME/Library/Caches/com.kennethaman.dwo"
fi

echo "[install-app] Successfully installed DWO.app!"
