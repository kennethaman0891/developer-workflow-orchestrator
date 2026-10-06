'use client';

import { useEffect } from 'react';

// Module-scope console.error forwarder: Next.js production catches render
// exceptions in its error boundary and only reports them via console.error —
// window.onerror never fires for them. Patching at module-eval time (before
// any app chunk runs) is the only way to capture those. Errors are buffered
// until the Tauri IPC is ready, then flushed.
(() => {
  if (typeof window === 'undefined') return; // server prerender
  const w = window as typeof window & { __dwoConsolePatched?: boolean };
  if (w.__dwoConsolePatched) return;
  w.__dwoConsolePatched = true;

  const buffer: string[] = [];
  let flushReady = false;

  const flush = (invokeFn: (cmd: string, args: Record<string, unknown>) => Promise<unknown>) => {
    flushReady = true;
    while (buffer.length > 0) {
      const msg = buffer.shift()!;
      invokeFn('frontend_error', { message: msg }).catch(() => {});
    }
  };

  import('@tauri-apps/api/core')
    .then(({ invoke }) => flush(invoke))
    .catch(() => {});

  const send = (msg: string) => {
    if (buffer.length < 50) buffer.push(msg);
    if (flushReady) {
      // flush() drains; re-drain anything added after readiness.
      import('@tauri-apps/api/core')
        .then(({ invoke }) => {
          while (buffer.length > 0) {
            invoke('frontend_error', { message: buffer.shift() }).catch(() => {});
          }
        })
        .catch(() => {});
    }
  };

  const origError = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    try {
      const text = args
        .map((a) => (a instanceof Error ? `${a.name}: ${a.message}\n${a.stack ?? ''}` : typeof a === 'object' ? JSON.stringify(a) : String(a)))
        .join(' ');
      send(`[console.error] ${text.slice(0, 4000)}`);
    } catch {
      /* never break the app over logging */
    }
    origError(...args);
  };
})();

/**
 * Global error reporter: pipes uncaught frontend exceptions and unhandled
 * promise rejections into the Rust-side log via the `frontend_error`
 * command, so WKWebView crashes are diagnosable from rust-panics.log.
 */
export function ErrorReporter() {
  useEffect(() => {
    let active = true;

    const report = (kind: string, error: unknown) => {
      if (!active) return;
      const detail =
        error instanceof Error
          ? `${error.name}: ${error.message}\n${error.stack ?? ''}`
          : String(error);
      // Dynamic import keeps this module SSR-safe and avoids a hard
      // dependency on the Tauri runtime at import time.
      import('@tauri-apps/api/core')
        .then(({ invoke }) => {
          if (active) {
            invoke('frontend_error', { message: `[${kind}] ${detail}` }).catch(() => {});
          }
        })
        .catch(() => {});
    };

    const onError = (event: ErrorEvent) => {
      // Ignore benign ResizeObserver-loop warnings and post-teardown xterm dimensions errors
      const msg = typeof event.message === 'string' ? event.message : '';
      if (msg.includes('ResizeObserver loop') || msg.includes('this._renderer.value.dimensions')) return;
      report('uncaught', event.error ?? event.message);
    };
    const onRejection = (event: PromiseRejectionEvent) => {
      report('unhandledrejection', event.reason);
    };

    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      active = false;
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, []);

  return null;
}
