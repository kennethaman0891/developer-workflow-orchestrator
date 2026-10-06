// Type declarations for Tauri
//
// Tauri injects these globals into the webview at runtime. The app only
// checks for their presence (or uses them opaquely), so `unknown` is enough
// and keeps the codebase free of explicit `any`.
declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown;
    __TAURI__?: unknown;
  }
}

export {};
