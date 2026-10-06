'use client';

import { useEffect, useRef, useState } from 'react';
import type { EditorView as EditorViewType } from '@codemirror/view';
import type { Extension } from '@codemirror/state';
import { useSettings } from '@/contexts/SettingsContext';

interface CodeEditorProps {
  filePath?: string;
  content?: string;
  onSave?: (path: string, content: string) => void;
}

/**
 * Load language extensions lazily (client-only).
 * All @codemirror/* packages touch `document` at import time, so they must
 * NEVER be statically imported — `output:export` prerender runs on Node
 * with no DOM and would emit a broken out/index.html.
 */
async function getLanguageExtension(filePath?: string): Promise<Extension[]> {
  if (!filePath) return [];
  const ext = filePath.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'js':
    case 'jsx':
    case 'ts':
    case 'tsx':
    case 'mjs': {
      const { javascript } = await import('@codemirror/lang-javascript');
      return [javascript({ jsx: true, typescript: true })];
    }
    case 'py': {
      const { python } = await import('@codemirror/lang-python');
      return [python()];
    }
    case 'html':
    case 'xml':
    case 'plist':
    case 'svg': {
      const { html } = await import('@codemirror/lang-html');
      return [html()];
    }
    case 'css': {
      const { css } = await import('@codemirror/lang-css');
      return [css()];
    }
    case 'json': {
      const { json } = await import('@codemirror/lang-json');
      return [json()];
    }
    case 'md':
    case 'markdown':
    default:
      return [];
  }
}

export function CodeEditor({ filePath, content, onSave }: CodeEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorViewType | null>(null);
  const filePathRef = useRef<string | undefined>(filePath);
  const onSaveRef = useRef(onSave);
  const contentRef = useRef(content);
  const fontSizeRef = useRef(14);
  const wordWrapRef = useRef(true);
  const [initError, setInitError] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);

  // Get settings from context
  const { fontSize, wordWrap } = useSettings();
  
  // Keep refs in sync with props
  useEffect(() => {
    filePathRef.current = filePath;
  }, [filePath]);

  useEffect(() => {
    onSaveRef.current = onSave;
  }, [onSave]);

  useEffect(() => {
    contentRef.current = content;
  }, [content]);

  useEffect(() => {
    fontSizeRef.current = fontSize;
  }, [fontSize]);

  useEffect(() => {
    wordWrapRef.current = wordWrap;
  }, [wordWrap]);

  useEffect(() => {
    const container = containerRef.current;
    let cancelled = false;

    if (!container) {
      setInitError('Container ref is null');
      return;
    }

    // Destroy previous view if exists
    if (viewRef.current) {
      viewRef.current.destroy();
      viewRef.current = null;
    }
    setIsReady(false);
    setInitError(null);

    // Small delay to ensure DOM has layout
    const timer = setTimeout(() => {
      void (async () => {
        try {
          // Check container dimensions again after timeout
          const rect = container.getBoundingClientRect();

          if (rect.width === 0 || rect.height === 0) {
            if (!cancelled) setInitError('Container has zero dimensions');
            return;
          }

          // Lazy-load CodeMirror on the client only (see module doc above).
          const [
            { EditorView, keymap, lineNumbers, highlightActiveLineGutter, scrollPastEnd },
            { EditorState },
            { oneDark },
            { autocompletion, completionKeymap },
            { lintKeymap },
            { foldGutter, foldKeymap, indentOnInput },
          ] = await Promise.all([
            import('@codemirror/view'),
            import('@codemirror/state'),
            import('@codemirror/theme-one-dark'),
            import('@codemirror/autocomplete'),
            import('@codemirror/lint'),
            import('@codemirror/language'),
          ]);
          if (cancelled) return;

          // Build language-specific extensions
          const langExt = await getLanguageExtension(filePath);
          if (cancelled) return;

          const extensions = [
            oneDark,
            // Core features
            lineNumbers(),
            highlightActiveLineGutter(),
            foldGutter(),
            scrollPastEnd(),
            EditorView.lineWrapping,
            // Keymaps
            keymap.of([...completionKeymap, ...lintKeymap, ...foldKeymap]),
            // Features
            autocompletion(),
            indentOnInput(),
            ...langExt,
          ];

          // Apply font-size via CSS
          container.style.fontSize = `${fontSizeRef.current}px`;

          // Create initial state with content
          const initialState = EditorState.create({
            doc: contentRef.current || '',
            extensions,
          });

          // Create new view
          const view = new EditorView({
            state: initialState,
            parent: container,
          });

          if (cancelled) {
            view.destroy();
            return;
          }

          viewRef.current = view;
          setIsReady(true);
        } catch (error) {
          if (!cancelled) {
            console.error('[CodeEditor] Failed to initialize:', error);
            setInitError(String(error));
          }
        }
      })();
    }, 150);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      if (viewRef.current) {
        viewRef.current.destroy();
        viewRef.current = null;
      }
    };
  }, [filePath, content]); // Re-init when file or content changes

  // Show loading indicator while waiting for initialization
  if (!isReady && !initError) {
    return (
      <div
        style={{
          height: '100%',
          background: 'var(--dwo-color-bg)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--dwo-color-text-muted)',
          fontSize: '13px',
        }}
      >
        Initializing editor...
      </div>
    );
  }

  return (
    <div
      style={{
        height: '100%',
        background: 'var(--dwo-color-bg)',
        position: 'relative',
        overflow: 'auto',
      }}
    >
      {initError && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            padding: '8px 12px',
            background: `var(--dwo-color-error)22`,
            color: 'var(--dwo-color-error)',
            fontSize: '12px',
            borderBottom: `1px solid var(--dwo-color-error)44`,
            zIndex: 10,
          }}
        >
          ⚠️ Editor init error: {initError}
        </div>
      )}
      <div
        ref={containerRef}
        style={{
          height: '100%',
          width: '100%',
        }}
      />
    </div>
  );
}
