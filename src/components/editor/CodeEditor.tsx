'use client';

import { EditorView } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { javascript } from '@codemirror/lang-javascript';
import { python } from '@codemirror/lang-python';
import { html } from '@codemirror/lang-html';
import { css } from '@codemirror/lang-css';
import { json } from '@codemirror/lang-json';
import { oneDark } from '@codemirror/theme-one-dark';
import { autocompletion } from '@codemirror/autocomplete';
import { lintKeymap } from '@codemirror/lint';
import { useEffect, useRef } from 'react';

// File extension to language mapping
const langMap: Record<string, any> = {
  '.js': javascript,
  '.jsx': javascript,
  '.ts': javascript,
  '.tsx': javascript,
  '.py': python,
  '.html': html,
  '.css': css,
  '.json': json,
};

interface CodeEditorProps {
  filePath?: string;
  content?: string;
}

export function CodeEditor({ filePath, content }: CodeEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const extensions = [
      ...[oneDark], // spread the array [theme, syntaxHighlighting] properly
      autocompletion(),
      lintKeymap,
      ...Object.values(langMap).filter(Boolean),
    ];

    const state = EditorState.create({
      doc: content || '',
      extensions,
    });

    const view = new EditorView({
      state,
      parent: containerRef.current,
    });

    return () => {
      view.destroy();
    };
  }, [filePath]);

  return (
    <div style={{
      height: '100%',
      background: '#1e1e1e',
      position: 'relative',
    }}>
      <div ref={containerRef} style={{ height: '100%' }} />
    </div>
  );
}
