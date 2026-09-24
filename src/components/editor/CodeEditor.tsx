'use client';

import { useEffect, useRef, useState } from 'react';
import { EditorView, keymap, ViewUpdate, lineNumbers, highlightActiveLineGutter, scrollPastEnd } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { javascript } from '@codemirror/lang-javascript';
import { python } from '@codemirror/lang-python';
import { html } from '@codemirror/lang-html';
import { css } from '@codemirror/lang-css';
import { json } from '@codemirror/lang-json';
import { oneDark } from '@codemirror/theme-one-dark';
import { autocompletion, completionKeymap } from '@codemirror/autocomplete';
import { lintKeymap } from '@codemirror/lint';
import { foldGutter, foldKeymap, indentOnInput } from '@codemirror/language';
import { useSettings } from '@/contexts/SettingsContext';

interface CodeEditorProps {
  filePath?: string;
  content?: string;
  onSave?: (path: string, content: string) => void;
}

/** Map file extensions to CodeMirror language extensions */
function getLanguageExtension(filePath?: string) {
  if (!filePath) return [];
  const ext = filePath.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'js':
    case 'jsx':
    case 'ts':
    case 'tsx':
    case 'mjs':
      return [javascript({ jsx: true, typescript: true })];
    case 'py':
      return [python()];
    case 'html':
      return [html()];
    case 'css':
      return [css()];
    case 'json':
      return [json()];
    case 'xml':
    case 'plist':
    case 'svg':
      return [html()]; // XML uses tag-based syntax similar to HTML
    case 'md':
    case 'markdown':
      return [];
    default:
      return [];
  }
}

export function CodeEditor({ filePath, content, onSave }: CodeEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
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
    console.log('[CodeEditor] Effect triggered', {
      hasContainer: !!container,
      filePath,
      contentLength: content?.length,
    });

    if (!container) {
      console.log('[CodeEditor] Container ref is null - skipping init');
      setInitError('Container ref is null');
      return;
    }

    // Destroy previous view if exists
    if (viewRef.current) {
      console.log('[CodeEditor] Destroying previous view');
      viewRef.current.destroy();
      viewRef.current = null;
    }

    // Small delay to ensure DOM has layout
    const timer = setTimeout(() => {
      try {
        // Check container dimensions again after timeout
        const rect = container.getBoundingClientRect();
        console.log('[CodeEditor] Container dimensions after delay:', rect.width, 'x', rect.height);

        if (rect.width === 0 || rect.height === 0) {
          console.warn('[CodeEditor] Container has zero dimensions, will retry');
          setInitError('Container has zero dimensions');
          return;
        }

        // Build language-specific extensions
        const langExt = getLanguageExtension(filePath);
        const extensions = [
          oneDark,
          // Core features
          lineNumbers(),
          highlightActiveLineGutter(),
          foldGutter(),
          scrollPastEnd(),
          EditorView.lineWrapping,
          // Keymaps
          keymap.of([
            ...completionKeymap,
            ...lintKeymap,
            ...foldKeymap,
          ]),
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
          dispatch: (tr) => {
            view.dispatch(tr);
          },
        });

        viewRef.current = view;
        setIsReady(true);
        console.log('[CodeEditor] Editor initialized successfully for:', filePath);
      } catch (error) {
        console.error('[CodeEditor] Failed to initialize:', error);
        setInitError(String(error));
      }
    }, 150);

    return () => {
      clearTimeout(timer);
      if (viewRef.current) {
        console.log('[CodeEditor] Cleaning up editor');
        viewRef.current.destroy();
        viewRef.current = null;
      }
    };
  }, [filePath, content]); // Re-init when file or content changes

  // Show loading indicator while waiting for initialization
  if (!isReady && !initError) {
    return (
      <div style={{
        height: '100%',
        background: '#1e1e1e',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#888',
        fontSize: '13px',
      }}>
        Initializing editor...
      </div>
    );
  }

  return (
    <div style={{
      height: '100%',
      background: '#1e1e1e',
      position: 'relative',
      overflow: 'auto',
    }}>
      {initError && (
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          padding: '8px 12px',
          background: '#2d1215',
          color: '#ff6b6b',
          fontSize: '12px',
          borderBottom: '1px solid #ff4444',
          zIndex: 10,
        }}>
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
