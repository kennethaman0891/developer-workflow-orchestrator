/**
 * Safe Tauri invoke wrapper.
 *
 * When running inside the Tauri shell, this forwards to the real `invoke`.
 * When running in a regular browser (or during SSR), it resolves with the
 * provided `fallback` value so the UI degrades gracefully — no crashes,
 * no console noise.
 *
 * Uses dynamic import so the Tauri bundle is never loaded unless we're
 * actually inside Tauri — keeping web-only builds lean.
 *
 * @param command  Tauri backend command name
 * @param args     Optional arguments passed to the command
 * @param fallback Value to return when outside the Tauri runtime
 */

type InvokeArgs = Record<string, unknown> | undefined;

/** Returns true when running inside the Tauri shell (not a plain browser). */
export function isTauri(): boolean {
  return typeof globalThis !== 'undefined' && !!(globalThis as any).__TAURI_INTERNALS__;
}

export async function invoke<T = unknown>(
  command: string,
  args?: InvokeArgs,
  fallback?: T,
): Promise<T> {
  if (!isTauri()) {
    if (fallback !== undefined) return Promise.resolve(fallback as T);
    // No fallback provided — return a silent rejection so callers that
    // don't expect web-mode can still surface the issue.
    return Promise.reject(
      new Error(
        `[DWO] Tauri invoke('${command}') called outside of a Tauri window. ` +
        'Provide a fallback value or ensure this runs inside the shell.',
      ),
    );
  }

  const { invoke: tauriInvoke } = await import('@tauri-apps/api/core');
  return tauriInvoke<T>(command, args);
}
