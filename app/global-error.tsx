'use client';

import { useEffect } from 'react';

/**
 * Next.js production error boundary. When a render-phase exception kills the
 * app tree, Next renders THIS component — window.onerror never fires, so this
 * is the only place the real error is visible. Render it on screen AND pipe it
 * into the Rust log (rust-panics.log) via the `frontend_error` command.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    const detail = `${error.name}: ${error.message}\n${error.stack ?? ''}`;
    // Best-effort: the Tauri IPC may or may not be reachable; never rethrow.
    try {
      import('@tauri-apps/api/core')
        .then(({ invoke }) => invoke('frontend_error', { message: `[global-error] ${detail}` }))
        .catch(() => {});
    } catch {
      /* ignore */
    }
  }, [error]);

  return (
    <html lang="en">
      <body style={{ margin: 0, padding: 24, background: '#0a0a0a', color: '#f87171', fontFamily: 'monospace', fontSize: 13, whiteSpace: 'pre-wrap' }}>
        <div style={{ color: '#e8e8e8', fontWeight: 700, marginBottom: 8 }}>
          DWO crashed with a client-side error
        </div>
        <div>{error.name}: {error.message}</div>
        {error.digest ? <div style={{ color: '#888' }}>digest: {error.digest}</div> : null}
        <pre style={{ color: '#888', marginTop: 12 }}>{error.stack ?? 'no stack'}</pre>
        <button
          onClick={reset}
          style={{ marginTop: 16, background: '#4a9eff', color: '#fff', border: 'none', padding: '6px 14px', borderRadius: 4, cursor: 'pointer' }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
