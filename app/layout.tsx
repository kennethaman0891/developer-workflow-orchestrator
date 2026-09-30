'use client';

import { type ReactNode } from 'react';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { AuthProvider } from '@/contexts/AuthContext';

/**
 * Pre-paint theme script — runs synchronously before first paint so the
 * production static export (`out/index.html`) doesn't flash the default
 * `seti` theme before ThemeContext hydrates from localStorage.
 * Must stay dependency-free and exception-safe (private mode / file://).
 */
const THEME_PREPAINT_SCRIPT = `(function(){try{var k=localStorage.getItem('dwo-theme');if(!k)return;var d=document.documentElement;d.setAttribute('data-theme',k);}catch(e){}})();`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <script dangerouslySetInnerHTML={{ __html: THEME_PREPAINT_SCRIPT }} />
        <style>{`
          @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
          @keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
          @keyframes pop { 0% { transform: scale(0.8); opacity: 0; } 60% { transform: scale(1.15); } 100% { transform: scale(1); opacity: 1; } }
          @keyframes fade-in { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
          .dwo-icon-btn { transition: background 0.2s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.2s, color 0.15s; }
          .dwo-icon-btn:hover { background: #1a1a1a !important; opacity: 1 !important; }
          .dwo-close-btn:hover { color: #e8e8e8 !important; }
          .dwo-divider-v:hover, .dwo-divider-h:hover { background: #4a9eff !important; }
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
