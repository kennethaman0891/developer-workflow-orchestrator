// Monaco TypeScript/JavaScript worker (completion, diagnostics, hover, hints).
// `ts.worker.js` assigns `self.onmessage` at module scope — side-effect only.
import 'monaco-editor/languages/features/typescript/ts.worker.js';
