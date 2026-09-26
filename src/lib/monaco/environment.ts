import type { Environment } from 'monaco-editor';

/**
 * Monaco's `MonacoEnvironment` wiring.
 *
 * ## Why this file exists
 *
 * Monaco ships two worker code paths, and they are *not* equivalent:
 *
 * 1. **Language workers** (`typescript`/`json`/`css`/`html`) are created through
 *    `descriptor.createWorker`, which does `new Worker(new URL(<asset>), …)`.
 *    The bundler rewrites that into a self-contained chunk URL, so it usually
 *    works out of the box.
 * 2. **The base editor worker** (`editorWorkerService`) is created through
 *    `StandaloneWebWorkerService._createWorker`, which reads
 *    `descriptor.esmModuleLocationBundler` and turns it into a *file URL* that
 *    is then dynamically `import()`ed from a bootstrap `blob:` script.
 *
 *    Under a bundler the `new URL(..., import.meta.url)` is emitted as a raw
 *    asset that keeps its original relative imports, so the emitted file is a
 *    handful of bytes importing `../../../base/common/worker/webWorkerBootstrap.js`
 *    — paths that do not exist relative to `_next/static/media/`. The worker
 *    then dies on import and every editor feature that needs it (find, links,
 *    validation, diff) silently breaks.
 *
 * Defining `MonacoEnvironment.getWorker` short-circuits *both* paths: Monaco
 * returns the worker we hand back directly, with no `blob:` bootstrap and no
 * `whenESMWorkerReady` handshake. That fixes the broken asset *and* removes the
 * need for `worker-src blob:` in the Content-Security-Policy, because we never
 * mint one.
 *
 * ## The label switch is not arbitrary
 *
 * `getWorker` receives no fall-through: Monaco's `getWorker(descriptor, label)`
 * helper returns `MonacoEnvironment.getWorker(...)` unconditionally when it is
 * a function, so an unknown label *must* resolve to something that can speak the
 * base worker protocol. Hence `default` → base worker.
 *
 * The known labels come from Monaco's own registration code:
 *
 * | Label(s)                                            | Worker        |
 * |-----------------------------------------------------|---------------|
 * | `editorWorkerService`                               | base          |
 * | `typescript`, `javascript`                          | `ts.worker`   |
 * | `json`                                              | `json.worker` |
 * | `css`, `scss`, `less`                               | `css.worker`  |
 * | `html`, `handlebars`, `razor`                       | `html.worker` |
 *
 * Each worker is created with the literal URL patterns below because the
 * bundler can only statically analyse `new Worker(new URL('<literal>', …))` —
 * a template literal would produce no chunk at all.
 *
 * Every `new Worker(...)` is written without `{ type: 'module' }`, matching how
 * Monaco's own `descriptor.createWorker` runs them: a classic worker that
 * loads its chunk dependencies via `importScripts`, which is also the most
 * forgiving option under Tauri's custom protocol.
 *
 * Idempotent: safe to call from multiple React strict-mode renders and from
 * every component that lazily boots Monaco.
 */
export function installMonacoEnvironment(): void {
  // SSR / Node: there is no `self` and Monaco never runs here anyway.
  if (typeof self === 'undefined') return;

  // Already installed (possibly by a previous Monaco boot) — keep the first one.
  if (typeof self.MonacoEnvironment?.getWorker === 'function') return;

  const environment: Environment = {
    getWorker(workerId: string, label: string): Worker {
      switch (label) {
        case 'typescript':
        case 'javascript':
          return new Worker(new URL('./workers/ts.worker.ts', import.meta.url));

        case 'json':
          return new Worker(new URL('./workers/json.worker.ts', import.meta.url));

        case 'css':
        case 'scss':
        case 'less':
          return new Worker(new URL('./workers/css.worker.ts', import.meta.url));

        case 'html':
        case 'handlebars':
        case 'razor':
          return new Worker(new URL('./workers/html.worker.ts', import.meta.url));

        case 'editorWorkerService':
        default:
          if (process.env.NODE_ENV !== 'production' && label !== 'editorWorkerService') {
            console.warn(
              `[monaco] Unknown worker label "${label}" (requested by ${workerId}); ` +
                'falling back to the base editor worker. Add it to ' +
                'src/lib/monaco/environment.ts if Monaco added a new language worker.',
            );
          }
          return new Worker(new URL('./workers/editor.worker.ts', import.meta.url));
      }
    },
  };

  self.MonacoEnvironment = environment;
}
