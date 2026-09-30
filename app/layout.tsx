'use client';

import { type ReactNode } from 'react';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { AuthProvider } from '@/contexts/AuthContext';

/**
 * Pre-paint theme script — runs synchronously before first paint so the
 * production static export (`out/index.html`) doesn't flash the wrong theme
 * before ThemeContext hydrates from localStorage. Sets `data-theme`, and the
 * static per-theme CSS below resolves every --dwo-* var immediately.
 * Must stay dependency-free and exception-safe (private mode / file://).
 */
const THEME_PREPAINT_SCRIPT = `(function(){try{var k=localStorage.getItem('dwo-theme');var ok={seti:1,dark:1,midnight:1,ocean:1,carbon:1};if(k&&ok[k]){document.documentElement.setAttribute('data-theme',k);}}catch(e){}})();`;

/**
 * Static first-paint theme vars — mirrors src/lib/themes.ts so var(--dwo-*)
 * consumers resolve correctly BEFORE ThemeContext's post-mount effect runs.
 * :root carries the seti default (the app's initial theme); each saved theme
 * overrides via the data-theme attribute the pre-paint script sets.
 * ThemeContext keeps ownership at runtime; this block is paint-time only.
 */
const THEME_STATIC_CSS = `
:root{
--dwo-color-bg:#1e1e1e;--dwo-color-bg-secondary:#252526;--dwo-color-bg-tertiary:#2d2d2d;
--dwo-color-text:#f8f8f2;--dwo-color-text-muted:#868a8f;--dwo-color-accent:#ff9600;
--dwo-color-accent-hover:#ffb44d;--dwo-color-border:#3e4452;--dwo-color-success:#5ec4b0;
--dwo-color-warning:#d19a66;--dwo-color-error:#f44747;--dwo-color-surface:#2d2d2d;
--dwo-font-mono:"JetBrains Mono","Fira Code","Consolas",monospace;
--dwo-font-sans:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
background:#1e1e1e;color:#f8f8f2;
}
[data-theme="dark"]{
--dwo-color-bg:#0a0a0a;--dwo-color-bg-secondary:#111111;--dwo-color-bg-tertiary:#1a1a1a;
--dwo-color-text:#e8e8e8;--dwo-color-text-muted:#888888;--dwo-color-accent:#4a9eff;
--dwo-color-accent-hover:#6ab0ff;--dwo-color-border:#2a2a2a;--dwo-color-success:#4ade80;
--dwo-color-warning:#fbbf24;--dwo-color-error:#f87171;--dwo-color-surface:#1a1a1a;
background:#0a0a0a;color:#e8e8e8;
}
[data-theme="midnight"]{
--dwo-color-bg:#0d1b2a;--dwo-color-bg-secondary:#142438;--dwo-color-bg-tertiary:#1b2d42;
--dwo-color-text:#e0e6ed;--dwo-color-text-muted:#7aa2c0;--dwo-color-accent:#5ba4e6;
--dwo-color-accent-hover:#7ec0f5;--dwo-color-border:#1e3a54;--dwo-color-success:#4ade80;
--dwo-color-warning:#fbbf24;--dwo-color-error:#f87171;--dwo-color-surface:#1b2d42;
background:#0d1b2a;color:#e0e6ed;
}
[data-theme="ocean"]{
--dwo-color-bg:#1a1b26;--dwo-color-bg-secondary:#202330;--dwo-color-bg-tertiary:#262a38;
--dwo-color-text:#c0caf5;--dwo-color-text-muted:#565f89;--dwo-color-accent:#7aa2f7;
--dwo-color-accent-hover:#8db0f8;--dwo-color-border:#2e3c5e;--dwo-color-success:#9ece6a;
--dwo-color-warning:#e0af68;--dwo-color-error:#f7768e;--dwo-color-surface:#262a38;
background:#1a1b26;color:#c0caf5;
}
[data-theme="carbon"]{
--dwo-color-bg:#161616;--dwo-color-bg-secondary:#262626;--dwo-color-bg-tertiary:#393939;
--dwo-color-text:#f4f4f4;--dwo-color-text-muted:#a8a8a8;--dwo-color-accent:#4589ff;
--dwo-color-accent-hover:#78a9ff;--dwo-color-border:#393939;--dwo-color-success:#42be65;
--dwo-color-warning:#f1c21b;--dwo-color-error:#fa4d56;--dwo-color-surface:#393939;
background:#161616;color:#f4f4f4;
}`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <script dangerouslySetInnerHTML={{ __html: THEME_PREPAINT_SCRIPT }} />
        <style>{`
          ${THEME_STATIC_CSS}
          @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
          @keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
          @keyframes pop { 0% { transform: scale(0.8); opacity: 0; } 60% { transform: scale(1.15); } 100% { transform: scale(1); opacity: 1; } }
          @keyframes fade-in { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
          .dwo-icon-btn { transition: background 0.2s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.2s, color 0.15s; }
          .dwo-icon-btn:hover { background: var(--dwo-color-bg-tertiary, #1a1a1a) !important; opacity: 1 !important; }
          .dwo-close-btn:hover { color: var(--dwo-color-text, #e8e8e8) !important; }
          .dwo-divider-v:hover, .dwo-divider-h:hover { background: var(--dwo-color-accent, #4a9eff) !important; }
        `}</style>
      </head>
      <body style={{ margin: 0, padding: 0 }}>
        <AuthProvider>
          <ThemeProvider>{children}</ThemeProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
