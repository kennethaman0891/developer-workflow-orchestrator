'use client';

/**
 * terminalDims — records each xterm instance's actually-fitted cols/rows so
 * layout code (e.g. the auto-launch pre-resize) can use exact dimensions
 * instead of pixel math, and can wait until the fitted size is known.
 *
 * A module-level Map: it survives React remounts and needs no Tauri IPC.
 */

export interface PtyDims {
  cols: number;
  rows: number;
}

const dims = new Map<string, PtyDims>();

/** Last user-input timestamps per session (ms epoch), for launch coordination. */
const lastInput = new Map<string, number>();

/** Record user keystrokes — auto-launch defers while the user is typing. */
export function reportInputActivity(id: string): void {
  if (!id) return;
  lastInput.set(id, Date.now());
}

/** Ms since last input for a session (Infinity when never). */
export function msSinceInput(id: string): number {
  const t = lastInput.get(id);
  return t === undefined ? Infinity : Date.now() - t;
}

/** Forget a session's input record (call on session close). */
export function forgetInputActivity(id: string): void {
  lastInput.delete(id);
}

/** Record the fitted dimensions of a session's xterm instance. */
export function reportTerminalDims(id: string, cols: number, rows: number): void {
  if (!id || cols <= 0 || rows <= 0) return;
  dims.set(id, { cols, rows });
}

/** Read the last reported fitted dimensions for a session. */
export function getTerminalDims(id: string): PtyDims | null {
  return dims.get(id) ?? null;
}

/**
 * Poll until every id has reported dims or the timeout elapses.
 * Never rejects — callers may proceed with whatever is available.
 */
export function waitForTerminalDims(ids: string[], timeoutMs = 2000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve) => {
    const tick = () => {
      if (Date.now() >= deadline || ids.every((id) => dims.has(id))) {
        resolve();
        return;
      }
      setTimeout(tick, 100);
    };
    tick();
  });
}

/** Forget a session's dims (call on session close). */
export function forgetTerminalDims(id: string): void {
  dims.delete(id);
  forgetInputActivity(id);
}
