'use client';

import { useEffect, useRef } from 'react';
import type { Terminal, ITerminalOptions } from 'xterm';
import type { FitAddon } from 'xterm-addon-fit';
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import 'xterm/css/xterm.css';

interface TerminalAnchorProps {
  sessionId?: string;
  className?: string;
}

export function TerminalAnchor({ sessionId, className = '' }: TerminalAnchorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const disposedRef = useRef(false);
  const sessionIdRef = useRef(sessionId);
  const canWriteRef = useRef(false); // guards against writes before init completes
  sessionIdRef.current = sessionId;

  useEffect(() => {
    if (!terminalRef.current) return;

    disposedRef.current = false;

    let unlistenOutput: UnlistenFn | null = null;
    let unlistenResizeCleanup: (() => void) | null = null;
    let writeChain = Promise.resolve();

    // Dynamic imports to avoid SSR issues
    import('xterm').then(async (xtermModule) => {
      const { Terminal } = xtermModule;
      const { FitAddon } = await import('xterm-addon-fit');
      const { WebLinksAddon } = await import('xterm-addon-web-links');

      const term = new Terminal({
        cursorBlink: true,
        fontFamily: '"JetBrains Mono", "Fira Code", "Consolas", monospace',
        fontSize: 14,
        theme: {
          background: '#0a0a0a',
          foreground: '#e8e8e8',
          cursor: '#4a9eff',
          selectionBackground: '#4a9eff33',
        },
        allowProposedApi: true,
        scrollback: 10000,
      } as ITerminalOptions);

      const fitAddon = new FitAddon();
      const webLinksAddon = new WebLinksAddon();
      const { ClipboardAddon } = await import('@xterm/addon-clipboard');
      const clipboardAddon = new ClipboardAddon();

      term.loadAddon(fitAddon);
      term.loadAddon(webLinksAddon);
      term.loadAddon(clipboardAddon);
      term.open(terminalRef.current!);
      fitAddon.fit();

      // Focus immediately and also after a short delay
      term.focus();
      const focusTimer = setTimeout(() => term.focus(), 100);

      termRef.current = term;
      fitAddonRef.current = fitAddon;
      canWriteRef.current = true; // terminal is now ready to accept input

      // Resize the xterm viewport with its container
      // Observe the outer containerRef (which has actual size constraints from
      // the grid cell) rather than the inner terminalRef (which uses 100%).
      let fitRaf = 0;
      const resizeObserver = new ResizeObserver(() => {
        // Debounce via requestAnimationFrame so rapid resize drags don't
        // cause an xterm.js re-render storm.
        cancelAnimationFrame(fitRaf);
        fitRaf = requestAnimationFrame(() => {
          if (!disposedRef.current) fitAddon.fit();
        });
      });
      resizeObserver.observe(containerRef.current!);
      unlistenResizeCleanup = () => {
        resizeObserver.disconnect();
        cancelAnimationFrame(fitRaf);
        clearTimeout(focusTimer);
      };

      term.onResize(({ cols, rows }) => {
        const id = sessionIdRef.current;
        if (id) {
          invoke('terminal_resize', { id, cols, rows }).catch(console.error);
        }
      });

      // Forward keystrokes to the PTY
      term.onData((data) => {
        if (!canWriteRef.current || disposedRef.current) return;
        const id = sessionIdRef.current;
        if (id) {
          invoke('terminal_write', { id, data }).catch((e) => {
            console.error('Failed to write to terminal:', e);
          });
        }
      });

      // Replay scrollback
      if (sessionId) {
        invoke<string[]>('terminal_get_scrollback', { id: sessionId })
          .then((lines) => {
            if (disposedRef.current || lines.length === 0) return;
            writeChain = writeChain.then(() => {
              if (!disposedRef.current) term.write(lines.join('\r\n') + '\r\n');
            });
          })
          .catch(console.error);

        // Stream live output
        listen<{ session_id: string; data: string }>('terminal-output', (event) => {
          if (disposedRef.current || event.payload.session_id !== sessionId) return;
          writeChain = writeChain.then(() => {
            if (!disposedRef.current) term.write(event.payload.data);
          });
        })
          .then((unlisten) => {
            if (disposedRef.current) unlisten();
            else unlistenOutput = unlisten;
          })
          .catch(console.error);
      }
    }).catch(console.error);

    return () => {
      disposedRef.current = true;
      unlistenOutput?.();
      unlistenResizeCleanup?.();
      const term = termRef.current;
      termRef.current = null;
      fitAddonRef.current = null;
      term?.dispose();
    };
  }, [sessionId]);

  // Ensure terminal stays focused
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleFocus = () => {
      termRef.current?.focus();
    };

    const handleClick = () => {
      // Re-focus xterm when the user clicks anywhere in the terminal area.
      // Do NOT call stopPropagation — that would break xterm's internal
      // text-selection and cursor-positioning handlers.
      termRef.current?.focus();
    };

    container.addEventListener('focus', handleFocus);
    container.addEventListener('click', handleClick);
    container.addEventListener('mousedown', handleClick);

    // Handle Ctrl+V / Cmd+V paste via the paste event's built-in clipboard data.
    // Using e.clipboardData is synchronous and works reliably in WKWebView,
    // unlike navigator.clipboard.readText() which requires permissions and may fail.
    const handlePaste = (e: ClipboardEvent) => {
      if (!termRef.current) return;
      const text = e.clipboardData?.getData('text/plain');
      if (text) {
        e.preventDefault();
        termRef.current.paste(text);
      }
    };
    container.addEventListener('paste', handlePaste);

    return () => {
      container.removeEventListener('focus', handleFocus);
      container.removeEventListener('click', handleClick);
      container.removeEventListener('mousedown', handleClick);
      container.removeEventListener('paste', handlePaste);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className={className}
      style={{
        width: '100%',
        height: '100%',
        cursor: 'text',
        outline: 'none',
      }}
      tabIndex={0}
    >
      <div ref={terminalRef} style={{ width: '100%', height: '100%' }} />
    </div>
  );
}
