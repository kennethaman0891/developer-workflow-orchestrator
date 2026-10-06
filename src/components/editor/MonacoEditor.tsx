'use client';

/**
 * Monaco-backed code editor.
 *
 * This replaces the previous CodeMirror wrapper, whose `dispatch` handler
 * re-entered `EditorView.dispatch` and overflowed the stack on every keystroke,
 * and which re-created the editor on every content change — destroying cursor,
 * scroll position and undo history on each save.
 *
 * Rules this component enforces:
 *   1. The Monaco editor is created exactly once per mount and disposed only on unmount.
 *   2. Monaco owns the text. React observes it; it never pushes `content` back into
 *      a live model, so there is no feedback loop.
 *   3. Switching files swaps the *model*, not the editor, which preserves undo
 *      history and scroll position per file — the same model Monaco uses in VS Code.
 *   4. Zero-size containers are handled by Monaco's own `automaticLayout` observer
 *      rather than a timed retry that could give up permanently.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { editor, IDisposable, Uri } from 'monaco-editor';
import { useSettings } from '@/contexts/SettingsContext';
import { useTheme } from '@/contexts/ThemeContext';
import { getLanguageForPath, getLanguageLabel } from '@/lib/monaco/language';
import { applyMonacoTheme, getMonacoThemeName } from '@/lib/monaco/theme';
import { installMonacoEnvironment } from '@/lib/monaco/environment';
import {
  createLspClient,
  DwoLspTransport,
  type DwoLspClientHandle,
  type LspStartResult,
} from '@/lib/monaco/lspTransport';
import { invoke } from '@/lib/tauri';

type MonacoModule = typeof import('monaco-editor');

/** Status reported to the surrounding shell (status bar). */
export interface EditorStatus {
  language: string;
  line: number;
  column: number;
  selectionCount: number;
}

export interface MonacoEditorProps {
  /** Absolute path of the file being edited. Drives the model identity. */
  filePath: string;
  /** Initial content, used only when the model for `filePath` does not exist yet. */
  content: string;
  /** Fired when the buffer changes. Used to mark the tab dirty. */
  onChange?: (path: string, content: string) => void;
  /** Fired on Cmd/Ctrl+S with the current buffer. */
  onSave?: (path: string, content: string) => void;
  /** Fired on cursor/selection/language changes. */
  onStatus?: (status: EditorStatus) => void;
}

// ── Monaco loading ──────────────────────────────────────────────────────────
// Loaded once, lazily, outside of React's render path. Monaco touches
// `document`/`window` at import time, so it must never be part of the SSR pass.

let monacoPromise: Promise<MonacoModule> | null = null;

export function loadMonaco(): Promise<MonacoModule> {
  if (!monacoPromise) {
    // Must happen before Monaco is even imported: the base editor worker is
    // otherwise built from an asset URL that a bundler cannot resolve, and every
    // worker would otherwise be handed back through the `blob:` bootstrap path
    // (which the Tauri CSP has to allow). See lib/monaco/environment.ts.
    installMonacoEnvironment();
    monacoPromise = import('monaco-editor').catch((error) => {
      // Allow a retry after a transient failure (e.g. first load interrupted).
      monacoPromise = null;
      throw error;
    });
  }
  return monacoPromise;
}

/**
 * Map a filesystem path to a stable Monaco `file:` URI.
 * Backslashes are normalised so Windows paths produce a consistent identity.
 */
function pathToUri(monaco: MonacoModule, path: string): Uri {
  let normalized = path.replace(/\\/g, '/');
  // `c:/foo` must not become `file:///c%3A/foo`; Monaco expects a lowercase drive letter.
  if (/^[A-Za-z]:\//.test(normalized)) {
    normalized = normalized[0].toLowerCase() + normalized.slice(1);
  }
  return monaco.Uri.from({ scheme: 'file', path: normalized });
}

// ── Language-server sessions ────────────────────────────────────────────────
//
// Architectural decision (A) — full rationale in `src/lib/monaco/lspTransport.ts`:
// an LSP client attaches **only** to languages Monaco has no language worker
// for. `.ts`/`.js` keep their built-in TypeScript worker (completion,
// diagnostics, hints) and are deliberately *never* handed to an external
// server, so no provider is registered twice and no diagnostic is shown twice.
// The backend still speaks the `typescript-language-server --stdio` protocol;
// flipping ts/js over later is a frontend-only change.

/** Languages DWO attaches an external language server to. */
const LSP_LANGUAGES = new Set([
  'rust',
  'python',
  'go',
  'php',
  'ruby',
  'c',
  'cpp',
  'shell',
  'shellscript',
  'yaml',
  'lua',
  'dart',
  'swift',
]);

/** Languages already warned about, so a missing binary is logged once. */
const lspWarnedLanguages = new Set<string>();

/** Feature-detect failure: warn once per language, never per render. */
function warnLspUnavailable(language: string, reason: string): void {
  if (lspWarnedLanguages.has(language)) return;
  lspWarnedLanguages.add(language);
  console.warn(
    `[lsp] no language server attached for '${language}' (${reason}). ` +
      'The editor keeps Monaco\'s built-in behaviour; install the server to enable LSP.',
  );
}

/** Best-effort kill for a server that started but never became the session. */
function stopClient(clientId: string): void {
  invoke('lsp_stop', { clientId }, null).catch(() => undefined);
}

/**
 * Best-effort `file://` URI of the directory holding `filePath`.
 *
 * `lsp_start` walks up from there to the nearest project marker
 * (`Cargo.toml`, `package.json`, `.git`, …) and reports the resolved root
 * back as `root_uri`, which becomes `initialize.rootUri`.
 */
function directoryUri(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/');
  const slash = normalized.lastIndexOf('/');
  const dir = slash > 0 ? normalized.slice(0, slash) : '/';
  if (/^[A-Za-z]:\//.test(dir)) return `file:///${dir}`;
  if (/^[A-Za-z]:$/.test(dir)) return `file:///${dir}/`;
  return dir.startsWith('/') ? `file://${dir}` : 'file:///';
}

/** One live language server bound to a single language. */
interface LspSession {
  language: string;
  clientId: string;
  transport: DwoLspTransport;
  client: DwoLspClientHandle;
}

/** Release the cached model for a path — called when its tab is closed. */
export function disposeEditorModel(path: string): void {
  if (!monacoPromise) return;
  monacoPromise
    .then((monaco) => {
      const model = monaco.editor.getModel(pathToUri(monaco, path));
      if (model) model.dispose();
    })
    .catch(() => {
      // Monaco never loaded — nothing to dispose.
    });
}

export function MonacoEditor({ filePath, content, onChange, onSave, onStatus }: MonacoEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<MonacoModule | null>(null);

  // Latest props, read from refs so long-lived Monaco subscriptions never
  // capture a stale closure (the failure mode that broke the previous editor).
  const contentRef = useRef(content);
  const filePathRef = useRef(filePath);
  const onChangeRef = useRef(onChange);
  const onSaveRef = useRef(onSave);
  const onStatusRef = useRef(onStatus);

  const { fontSize, wordWrap, minimap } = useSettings();
  const { currentThemeKey } = useTheme();

  const [loadError, setLoadError] = useState<string | null>(null);
  const [editorReady, setEditorReady] = useState(false);

  // Keep refs in sync with the latest render.
  contentRef.current = content;
  filePathRef.current = filePath;
  onChangeRef.current = onChange;
  onSaveRef.current = onSave;
  onStatusRef.current = onStatus;

  /** Attach the model for `path` to the editor, creating it on first open. */
  const attachModel = useCallback((monaco: MonacoModule, instance: editor.IStandaloneCodeEditor) => {
    const uri = pathToUri(monaco, filePathRef.current);
    let model = monaco.editor.getModel(uri);

    if (model && model.isDisposed()) {
      model = null;
    }

    if (!model) {
      // First time we have seen this file: seed it from the prop.
      const language = getLanguageForPath(monaco, filePathRef.current);
      model = monaco.editor.createModel(contentRef.current ?? '', language, uri);
    } else {
      // Already open: Monaco's model is the source of truth so that undo history
      // and unsaved edits survive tab switches. If the language changed on disk
      // (e.g. a rename to a different extension) refresh it.
      const language = getLanguageForPath(monaco, filePathRef.current);
      if (language && model.getLanguageId() !== language) {
        monaco.editor.setModelLanguage(model, language);
      }
    }

    if (instance.getModel() !== model) {
      instance.setModel(model);
    }
    instance.focus();
  }, []);

  // ── Language-server session ───────────────────────────────────────────────
  // Exactly one server at a time: Monaco's LSP client registers its providers
  // globally per document selector, so overlapping sessions would fight over
  // the same models (and both would push marker owner `"lsp"`).
  const lspSessionRef = useRef<LspSession | null>(null);

  /** Tear the active session down: client → transport → backend, in that order. */
  const stopLsp = useCallback(() => {
    const session = lspSessionRef.current;
    if (!session) return;
    lspSessionRef.current = null;

    // Order matters: the client may still emit `textDocument/didClose` while
    // disposing, and that notification needs a live transport to ride on.
    try {
      session.client.dispose();
    } catch (error) {
      console.warn('[lsp] client dispose failed:', error);
    }
    session.transport.dispose();

    // Drop diagnostics owned by the LSP layer so stale squiggles cannot
    // outlive the session. Monaco's built-in workers use different owners.
    const monaco = monacoRef.current;
    if (monaco) {
      for (const model of monaco.editor.getModels()) {
        monaco.editor.setModelMarkers(model, 'lsp', []);
      }
    }

    invoke('lsp_stop', { clientId: session.clientId }, null).catch((error: unknown) => {
      console.warn('[lsp] lsp_stop failed:', error);
    });
  }, []);

  // ── Create the editor exactly once per mount ───────────────────────────────
  useEffect(() => {
    let cancelled = false;
    const disposables: IDisposable[] = [];

    loadMonaco()
      .then((monaco) => {
        if (cancelled) return;
        const container = containerRef.current;
        if (!container) return;

        monacoRef.current = monaco;
        applyMonacoTheme(monaco, currentThemeKey);

        const instance = monaco.editor.create(container, {
          theme: getMonacoThemeName(currentThemeKey),
          model: null,
          automaticLayout: true,
          fontSize,
          wordWrap: wordWrap ? 'on' : 'off',
          minimap: { enabled: minimap },
          scrollBeyondLastLine: false,
          renderLineHighlight: 'all',
          cursorBlinking: 'smooth',
          smoothScrolling: true,
          padding: { top: 8, bottom: 8 },
          fixedOverflowWidgets: true,
          tabSize: 2,
          insertSpaces: true,
          detectIndentation: true,
          formatOnPaste: false,
          formatOnType: false,
          // Monaco's widgets already handle accessibility well enough for the shell.
          accessibilitySupport: 'auto',
          colorDecorators: true,
          bracketPairColorization: { enabled: true },
          guides: { bracketPairs: true, indentation: true },
          suggest: { showWords: true, snippetsPreventQuickSuggestions: false },
          quickSuggestions: { other: true, comments: false, strings: false },
          suggestSelection: 'first',
          acceptSuggestionOnEnter: 'on',
          tabCompletion: 'on',
        });

        editorRef.current = instance;

        // Save: bound once. `CtrlCmd` resolves to Cmd on macOS and Ctrl elsewhere.
        instance.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
          const model = instance.getModel();
          if (model) onSaveRef.current?.(filePathRef.current, model.getValue());
        });

        // Content changes → React (dirty state only; we never write back).
        disposables.push(
          instance.onDidChangeModelContent(() => {
            const model = instance.getModel();
            if (model) onChangeRef.current?.(filePathRef.current, model.getValue());
          }),
        );

        // Cursor / selection → status bar.
        disposables.push(
          instance.onDidChangeCursorPosition((e) => {
            onStatusRef.current?.({
              language: getLanguageLabel(monaco, instance.getModel()?.getLanguageId()),
              line: e.position.lineNumber,
              column: e.position.column,
              selectionCount: instance.getSelections()?.length ?? 1,
            });
          }),
        );

        attachModel(monaco, instance);
        setEditorReady(true);
      })
      .catch((error: unknown) => {
        if (!cancelled) setLoadError(error instanceof Error ? error.message : String(error));
      });

    return () => {
      cancelled = true;
      stopLsp();
      disposables.forEach((d) => d.dispose());
      editorRef.current?.dispose();
      editorRef.current = null;
      monacoRef.current = null;
      setEditorReady(false);
    };
    // Deliberately empty: the editor lifecycle is bound to mount, not to props.
    // `currentThemeKey`, `fontSize` and `wordWrap` are applied by the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Swap the model when a different file becomes active ────────────────────
  useEffect(() => {
    if (!editorReady) return;
    const monaco = monacoRef.current;
    const instance = editorRef.current;
    if (!monaco || !instance) return;
    attachModel(monaco, instance);
  }, [editorReady, filePath, attachModel]);

  // ── Attach a language server for the active file's language ───────────────
  // Declared *after* the model swap so the model is already attached when this
  // runs. Same-language file switches reuse the running server; switching to a
  // non-LSP language (including ts/js, see decision (A)) tears it down.
  useEffect(() => {
    if (!editorReady) return;
    const monaco = monacoRef.current;
    const model = editorRef.current?.getModel();
    if (!monaco || !model) return;

    const language = model.getLanguageId();

    if (!LSP_LANGUAGES.has(language)) {
      stopLsp();
      return;
    }
    // Already attached for this language — nothing to do for the new file.
    if (lspSessionRef.current?.language === language) return;

    // Stale session from a different language (or an in-flight start).
    let cancelled = false;
    stopLsp();

    const rootUri = directoryUri(filePathRef.current);
    invoke<LspStartResult>(
      'lsp_start',
      { language, rootUri },
      // Web build / non-Tauri window: report "unavailable", never reject.
      { available: false, client_id: null, reason: 'not running inside the Tauri shell', root_uri: null },
    )
      .then((result) => {
        if (cancelled) {
          if (result?.client_id) stopClient(result.client_id);
          return;
        }
        if (!result?.available || !result?.client_id) {
          warnLspUnavailable(language, result?.reason || 'no server binary found');
          return;
        }

        const transport = new DwoLspTransport(language, result.client_id, result.root_uri ?? rootUri);
        let client: DwoLspClientHandle;
        try {
          client = createLspClient(monaco.lsp.MonacoLspClient, transport);
        } catch (error) {
          transport.dispose();
          stopClient(result.client_id);
          warnLspUnavailable(language, error instanceof Error ? error.message : String(error));
          return;
        }

        if (cancelled) {
          client.dispose();
          transport.dispose();
          stopClient(result.client_id);
          return;
        }
        lspSessionRef.current = { language, clientId: result.client_id, transport, client };
      })
      .catch((error: unknown) => {
        warnLspUnavailable(language, error instanceof Error ? error.message : String(error));
      });

    return () => {
      cancelled = true;
    };
  }, [editorReady, filePath, stopLsp]);

  // ── Theme changes ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!editorReady) return;
    if (monacoRef.current) {
      // Register (idempotent) then activate via the editor API.
      // NOTE: `updateOptions({ theme })` is a no-op — IStandaloneEditorConstructionOptions
      // has no `theme` field — so theme switches must go through setTheme.
      applyMonacoTheme(monacoRef.current, currentThemeKey);
      monacoRef.current.editor.setTheme(getMonacoThemeName(currentThemeKey));
    }
  }, [editorReady, currentThemeKey]);

  // ── Settings changes ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!editorReady) return;
    editorRef.current?.updateOptions({
      fontSize,
      wordWrap: wordWrap ? 'on' : 'off',
      minimap: { enabled: minimap },
    });
  }, [editorReady, fontSize, wordWrap, minimap]);

  if (loadError) {
    return (
      <div
        style={{
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px',
          padding: '24px',
          textAlign: 'center',
          fontFamily: 'var(--dwo-font-mono, monospace)',
          background: 'var(--dwo-color-bg, #1e1e1e)',
        }}
      >
        <div style={{ fontSize: '40px' }}>⚠️</div>
        <div style={{ fontSize: '13px', color: 'var(--dwo-color-error, #f87171)' }}>
          Editor failed to load
        </div>
        <div
          style={{
            fontSize: '11px',
            color: 'var(--dwo-color-text-muted, #888)',
            maxWidth: '520px',
            wordBreak: 'break-word',
          }}
        >
          {loadError}
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      data-testid="monaco-editor-container"
      style={{
        height: '100%',
        width: '100%',
        minHeight: 0,
        background: 'var(--dwo-color-bg, #1e1e1e)',
      }}
    />
  );
}

/** Re-exported so consumers can rely on a single import surface. */
export type { editor };
