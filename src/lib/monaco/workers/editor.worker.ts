// Monaco base editor worker (validation, links, find/replace, diff computation).
//
// `editorWebWorkerMain.js` calls `bootstrapWebWorker(...)`, which installs its
// own `globalThis.onmessage` and spins up on the first client message — so this
// file only needs the side-effect import. It must stay a bare `import` so the
// bundler treats it as one worker entry (no exports, no `main`).
import 'monaco-editor/editor/common/services/editorWebWorkerMain.js';
