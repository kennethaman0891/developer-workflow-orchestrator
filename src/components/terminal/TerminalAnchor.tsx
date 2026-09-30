'use client';

import { useCallback, useEffect, useRef } from 'react';
import type { Terminal, ITerminalOptions } from 'xterm';
import type { FitAddon } from 'xterm-addon-fit';
import { invoke } from '@/lib/tauri';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { reportTerminalDims } from '@/lib/terminalDims';
import 'xterm/css/xterm.css';
import { useSettings } from '@/contexts/SettingsContext';

interface TerminalAnchorProps {
  sessionId?: string;
  className?: string;
  /**
   * True when the session is running a TUI application. TUIs keep their own
   * screen state (alt-screen, cursor control); replaying their scrollback into
   * a fresh xterm would double-render stale frames, so replay is skipped.
   */
  isTui?: boolean;
}

export function TerminalAnchor({ sessionId, className = '', isTui = false }: TerminalAnchorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const disposedRef = useRef(false);
  const sessionIdRef = useRef(sessionId);
  const canWriteRef = useRef(false); // guards against writes before init completes
  sessionIdRef.current = sessionId;
  const isTuiRef = useRef(isTui);
  isTuiRef.current = isTui;
  // Resize dedup: send terminal_resize only when the fitted cols/rows change,
  // collapsing the mount-time storm (init fit + fonts-ready + retry-fit +
  // ResizeObserver) into one real resize per distinct size.
  const lastSentDimsRef = useRef<string | null>(null);

  /** Send terminal_resize to the PTY only when the fitted size actually changed. */
  const sendResize = useCallback((id: string | undefined, cols: number, rows: number) => {
    if (!id || cols <= 0 || rows <= 0) return;
    const key = `${cols}x${rows}`;
    if (lastSentDimsRef.current === key) return;
    lastSentDimsRef.current = key;
    invoke('terminal_resize', { id, cols, rows }).catch(console.error);
  }, []);

  // A new session starts from scratch — allow its first resize through.
  useEffect(() => {
    lastSentDimsRef.current = null;
  }, [sessionId]);

  const { transparency, fontSize } = useSettings();

  // Compute background alpha from the global transparency setting (0-100).
  // transparency=0 → opaque, transparency=100 → fully transparent.
  const bgAlpha = Math.max(0, 1 - transparency / 100);
  const bgRgba = `rgba(10, 10, 10, ${bgAlpha})`;

  // Shared initializer — runs once per sessionId.
  // Uses a ref to avoid recreating the terminal on every render.
  const initRef = useRef(false);

  useEffect(() => {
    // If the element isn't mounted yet (or a previous init is mid-flight),
    // bail — the effect re-runs on session change after next render.
    if (!terminalRef.current || initRef.current) return;
    initRef.current = true;
    disposedRef.current = false;

    let unlistenOutput: UnlistenFn | null = null;
    let unlistenResizeCleanup: (() => void) | null = null;
    let writeChain = Promise.resolve();
    let fitRaf = 0;
    // Per-effect cancellation flag: unlike shared refs, this only flips for
    // THIS run's cleanup, so a stale async import can never resurrect a
    // terminal for a superseded sessionId.
    let cancelled = false;

    // Dynamic imports to avoid SSR issues
    import('xterm').then(async (xtermModule) => {
      // Guard against unmount during the async import: the DOM ref may be
      // null and xterm throws "Terminal requires a parent element".
      if (cancelled || disposedRef.current || !terminalRef.current) return;
      const { Terminal } = xtermModule;
      const { FitAddon } = await import('xterm-addon-fit');
      const { WebLinksAddon } = await import('xterm-addon-web-links');

      // Re-check again after the second dynamic import resolves
      if (cancelled || disposedRef.current || !terminalRef.current) return;

      const term = new Terminal({
        cursorBlink: true,
        fontFamily: '"JetBrains Mono", "Fira Code", "Consolas", "SF Mono", "Menlo", monospace',
        fontSize: fontSize,
        theme: {
          background: bgRgba,
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

      // Double-check the element is still mounted after the final import:
      // xterm throws "Terminal requires a parent element" if it isn't.
      if (cancelled || disposedRef.current || !terminalRef.current) {
        fitAddon.dispose?.();
        webLinksAddon.dispose?.();
        term.dispose();
        return;
      }

      const clipboardAddon = new ClipboardAddon();

      term.loadAddon(fitAddon);
      term.loadAddon(webLinksAddon);
      term.loadAddon(clipboardAddon);
      try {
        term.open(terminalRef.current);
      } catch (e) {
        // Element disappeared between the check and open — bail gracefully.
        console.warn('[TerminalAnchor] failed to open terminal:', e);
        term.dispose();
        return;
      }
      fitAddon.fit();

      // Ensure backend PTY is immediately synchronized with xterm's
      // calculated dimensions, and record the fitted size for layout code.
      reportTerminalDims(sessionIdRef.current ?? '', term.cols, term.rows);
      sendResize(sessionIdRef.current, term.cols, term.rows);

      // Re-fit once fonts have loaded in case character metrics changed
      if (typeof document !== 'undefined' && document.fonts?.ready) {
        document.fonts.ready.then(() => {
          if (!disposedRef.current && fitAddonRef.current && termRef.current) {
            fitAddonRef.current.fit();
            reportTerminalDims(sessionIdRef.current ?? '', termRef.current.cols, termRef.current.rows);
            sendResize(sessionIdRef.current, termRef.current.cols, termRef.current.rows);
          }
        });
      }

      // Focus immediately and also after a short delay
      term.focus();
      const focusTimer = setTimeout(() => term.focus(), 100);

      termRef.current = term;
      fitAddonRef.current = fitAddon;
      canWriteRef.current = true; // terminal is now ready to accept input

      // Apply transparency as CSS opacity on the outer container so the page
      // background shows through the terminal viewport.
      if (transparency > 0 && containerRef.current) {
        const blendFactor = (100 - transparency) / 100;
        containerRef.current.style.mixBlendMode = 'normal';
        const xtermEl = terminalRef.current?.querySelector('.xterm-screen');
        if (xtermEl) {
          (xtermEl as HTMLElement).style.opacity = String(blendFactor);
        }
      }

      // ── ResizeObserver on the OUTER containerRef ────────────────────────
      // The outer container has actual size constraints from the grid/flex
      // parent. The inner terminalRef uses 100% width/height so it inherits
      // whatever size the outer container gets.
      const resizeObserver = new ResizeObserver(() => {
        cancelAnimationFrame(fitRaf);
        fitRaf = requestAnimationFrame(() => {
          if (!disposedRef.current) {
            // Safety: only fit if container has non-zero dimensions
            const rect = containerRef.current?.getBoundingClientRect();
            if (rect && rect.width > 0 && rect.height > 0) {
              fitAddon.fit();
            }
          }
        });
      });
      resizeObserver.observe(containerRef.current!);
      unlistenResizeCleanup = () => {
        resizeObserver.disconnect();
        cancelAnimationFrame(fitRaf);
        clearTimeout(focusTimer);
      };

      term.onResize(({ cols, rows }) => {
        reportTerminalDims(sessionIdRef.current ?? '', cols, rows);
        sendResize(sessionIdRef.current, cols, rows);
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

      // ── Replay scrollback + stream live output ─────────────────────────
      // Register the live listener FIRST, then fetch the scrollback snapshot,
      // then write the replay. While the snapshot is in flight, live events
      // are buffered; the Rust side appends to scrollback before emitting
      // each output event, so the snapshot supersedes the buffered bytes and
      // they are written together with the replay — no output is lost in the
      // fetch window (the pre-fix ordering lost it entirely).
      // TUI sessions keep their own screen state — replaying their
      // scrollback into a fresh xterm would double-render stale frames, so
      // replay is skipped for them.
      const pendingEvents: string[] = [];
      let awaitingSnapshot = !!(sessionId && !isTuiRef.current);

      listen<{ session_id: string; data: string }>('terminal-output', (event) => {
        if (disposedRef.current || event.payload.session_id !== sessionId) return;
        if (awaitingSnapshot) {
          pendingEvents.push(event.payload.data);
          return;
        }
        writeChain = writeChain.then(() => {
          if (!disposedRef.current) term.write(event.payload.data);
        });
      })
        .then((unlisten) => {
          if (disposedRef.current) unlisten();
          else unlistenOutput = unlisten;
        })
        .catch(console.error);

      if (sessionId && !isTuiRef.current) {
        invoke<string[]>('terminal_get_scrollback', { id: sessionId })
          .then((lines) => {
            awaitingSnapshot = false;
            const tail = pendingEvents.join('');
            pendingEvents.length = 0;
            const replay = lines.length > 0 ? lines.join('\r\n') + '\r\n' : '';
            if (disposedRef.current || (!replay && !tail)) return;
            writeChain = writeChain.then(() => {
              if (disposedRef.current) return;
              if (replay) term.write(replay);
              if (tail) term.write(tail);
            });
          })
          .catch(() => {
            // Snapshot failed — flush whatever buffered in the meantime;
            // the live stream continues from here on.
            awaitingSnapshot = false;
            const tail = pendingEvents.join('');
            pendingEvents.length = 0;
            if (!tail || disposedRef.current) return;
            writeChain = writeChain.then(() => {
              if (!disposedRef.current) term.write(tail);
            });
          });
      }
    }).catch(console.error);

    return () => {
      cancelled = true;
      disposedRef.current = true;
      initRef.current = false;
      unlistenOutput?.();
      unlistenResizeCleanup?.();
      const term = termRef.current;
      termRef.current = null;
      fitAddonRef.current = null;
      term?.dispose();
    };
  }, [sessionId, sendResize]); // Only rebuild terminal on session change

  // ── Retry fit if container was 0×0 on first render ────────────────────────
  // This handles the case where the terminal mounts before its parent has
  // computed its final layout (common in split views and modals).
  // Also re-fits when display:none → visible because xterm starts at 0×0 then.
  useEffect(() => {
    if (!containerRef.current || !fitAddonRef.current) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const tryFit = () => {
      if (cancelled) return;
      const rect = containerRef.current?.getBoundingClientRect();
      if (rect && rect.width > 0 && rect.height > 0) {
        // Container is live — fit once, then keep watching for resizes.
        fitAddonRef.current?.fit();
        const id = sessionIdRef.current;
        if (id && termRef.current && termRef.current.cols > 0 && termRef.current.rows > 0) {
          reportTerminalDims(id, termRef.current.cols, termRef.current.rows);
          sendResize(id, termRef.current.cols, termRef.current.rows);
        }
        return;
      }
      // Container still 0×0 (likely display:none) — keep retrying until it
      // gets a real size (or the effect unmounts).
      timer = setTimeout(tryFit, 100);
    };

    // Fire after paint, then every 100 ms until the container has real size.
    timer = setTimeout(tryFit, 100);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [sessionId, sendResize]);

  // Reactively update transparency and font-size without tearing down the
  // terminal instance. Runs on every settings change after initial mount.
  useEffect(() => {
    const term = termRef.current;
    if (!term || disposedRef.current) return;

    // Update background colour with new alpha
    const newAlpha = Math.max(0, 1 - transparency / 100);
    const newBgRgba = `rgba(10, 10, 10, ${newAlpha})`;
    try {
      (term as unknown as { options: { theme: Record<string, string> } }).options.theme.background = newBgRgba;
    } catch {
      const xtermEl = terminalRef.current?.querySelector('.xterm-screen') as HTMLElement | null;
      if (xtermEl) xtermEl.style.opacity = String(newAlpha);
    }

    // Update font size
    try {
      (term as unknown as { options: { fontSize: number } }).options.fontSize = fontSize;
    } catch {}
    try {
      fitAddonRef.current?.fit();
    } catch {}

    // Update canvas-layer opacity
    const blendFactor = (100 - transparency) / 100;
    const xtermEl = terminalRef.current?.querySelector('.xterm-screen') as HTMLElement | null;
    if (xtermEl) xtermEl.style.opacity = String(blendFactor);
  }, [transparency, fontSize]);

  // Ensure terminal stays focused
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleFocus = () => {
      if (termRef.current) {
        termRef.current.focus();
      }
      const textarea = container?.querySelector('.xterm-helper-textarea') as HTMLTextAreaElement | null;
      textarea?.focus();
    };

    const handleClick = () => {
      if (termRef.current) {
        termRef.current.focus();
      }
      const textarea = container?.querySelector('.xterm-helper-textarea') as HTMLTextAreaElement | null;
      textarea?.focus();
    };

    container.addEventListener('focus', handleFocus);
    container.addEventListener('click', handleClick);
    container.addEventListener('mousedown', handleClick);

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
    >
      <div ref={terminalRef} style={{ width: '100%', height: '100%' }} />
    </div>
  );
}
