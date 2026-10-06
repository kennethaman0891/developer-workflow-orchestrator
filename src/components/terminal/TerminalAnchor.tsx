'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useTheme } from '@/contexts/ThemeContext';
import type { Terminal, ITerminalOptions } from 'xterm';
import type { FitAddon } from 'xterm-addon-fit';
import type { IClipboardProvider, ClipboardSelectionType } from '@xterm/addon-clipboard';
import { invoke } from '@/lib/tauri';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { reportTerminalDims, reportInputActivity } from '@/lib/terminalDims';
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

/**
 * Private xterm.js internals touched during teardown and refresh.
 * xterm exposes no public API for cancelling its internal animation frames,
 * so we narrow-cast into these fields behind the existing try/catch guards.
 */
/**
 * Strip OSC (Operating System Command) escape sequences from raw PTY output
 * before writing to xterm.
 *
 * xterm's DOM renderer corrupts its buffer rows when OSC sequences (e.g.
 * ESC ] 133 ; C BEL from the shell prompt's bracketed-paste markers) are
 * written while the terminal is being resized by fitAddon.fit(). The OSC
 * bytes interfere with xterm's internal line-wrapping at the new column
 * count, producing garbled textContent in `.xterm-rows` (e.g.
 * "eecho VIS_MARK]133;CVIS_MARK"). xterm renders prompts correctly without
 * these sequences — the user-visible prompt text is unaffected.
 */
const OSC_RE = /\x1b\].*?(\x07|\x1b\\)/g;
function stripOsc(data: string): string {
  return data.replace(OSC_RE, '');
}

interface XTermPrivateCore {
  viewport?: { _refreshAnimationFrame?: number | null };
  _renderService?: {
    _renderDebouncer?: { _animationFrame?: number | null };
    hasRenderer?: () => boolean;
  };
}

export function TerminalAnchor({ sessionId, className = '', isTui = false }: TerminalAnchorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const disposedRef = useRef(false);
  const sessionIdRef = useRef(sessionId);
  const canWriteRef = useRef(false);
  // Suspends live output writes during xterm reset+fit+replay to prevent reflow corruption
  const isResizingRef = useRef(false); // guards against writes before init completes
  sessionIdRef.current = sessionId;
  const isTuiRef = useRef(isTui);
  isTuiRef.current = isTui;
  // Resize dedup: send terminal_resize only when the fitted cols/rows change,
  // collapsing the mount-time storm (init fit + fonts-ready + retry-fit +
  // ResizeObserver) into one real resize per distinct size.
  const lastSentDimsRef = useRef<string | null>(null);
  // Debounce timer for publishing new cols/rows after an RO fit. Cleared on
  // each new resize and on teardown to avoid firing after unmount.
  const publishDimsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);


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
  
  /** Hex #rrggbb → [r,g,b] for rgba() composition. */
  const hexToRgb = (hex: string): [number, number, number] => {
    const m = hex.trim().match(/^#([0-9a-f]{6})$/i);
    if (!m) return [10, 10, 10];
    const n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  // Convert a hex color to an rgba string with the given alpha
  const withAlpha = (hex: string, alpha: number): string => {
    const n = parseInt(hex.replace('#', ''), 16);
    const r = (n >> 16) & 255;
    const g = (n >> 8) & 255;
    const b = n & 255;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  };

  // Compute background alpha from the global transparency setting (0-100).
  // transparency=0 → opaque, transparency=100 → fully transparent.
  // Base is the ACTIVE theme bg (not hardcoded #0a0a0a) so the canvas blends
  // in midnight/ocean/carbon/seti instead of only dark.
  const { theme } = useTheme();
  const bgAlpha = Math.max(0, 1 - transparency / 100);
  const [bgR, bgG, bgB] = hexToRgb(theme.colors.bg);
  const bgRgba = `rgba(${bgR}, ${bgG}, ${bgB}, ${bgAlpha})`;
  const fgColor = theme.colors.text;
  const cursorColor = theme.colors.accent;

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
          foreground: fgColor,
          cursor: cursorColor,
          selectionBackground: withAlpha(cursorColor, 0.2),
        
        },
        allowProposedApi: true,
        scrollback: 10000,
        windowsMode: true,
        convertEol: true,
      } as ITerminalOptions);

      // xterm's _reflowSmaller (called during terminal.resize()) corrupts
      // which corrupts buffer lines at the byte level when cols shrink
      // (grid→split: 80→52 cols). Even clean text gets garbled ("echo" → "eecho")
      // because _reflowSmaller mishandles line-wrapping across resized columns.
      // On macOS this also enables Windows wrapping heuristics, which is harmless
      // — our proactive reset+replay on each RO resize (below) handles visual re-wrapping.
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

      // Provide a custom clipboard provider that wraps navigator.clipboard in
      // try/catch. The default BrowserClipboardProvider calls
      // navigator.clipboard.readText/writeText without error handling, which
      // surfaces as an unhandled NotAllowedError rejection when the user agent
      // or platform denies clipboard permission (common in embedded webviews).
      const safeClipboardProvider: IClipboardProvider = {
        readText: (_selection: ClipboardSelectionType): string | Promise<string> => {
          if (typeof navigator?.clipboard?.readText === 'function') {
            return navigator.clipboard.readText().catch((err: unknown) => {
              console.warn('[TerminalAnchor] clipboard read denied:', err);
              return '';
            });
          }
          return '';
        },
        writeText: (_selection: ClipboardSelectionType, text: string): void | Promise<void> => {
          if (typeof navigator?.clipboard?.writeText === 'function' && window.isSecureContext) {
            return navigator.clipboard.writeText(text).catch((err: unknown) => {
              console.warn('[TerminalAnchor] clipboard write denied:', err);
            });
          }
          // Fallback: no-op (xterm copy/paste is non-critical for terminal operation)
        },
      };

      const clipboardAddon = new ClipboardAddon(undefined, safeClipboardProvider);

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
      term.reset();
      fitAddon.fit();

      // Publish a fitted size only when it is real: a pre-settle 0×0 rect
      // (cold prod launch, sidebar hydration shifting layout) yields bogus
      // 2-col sizes that poison the PTY + terminalDims registry + auto-launch
      // pre-resize. The retry path below self-corrects the visual side.
      //
      // Initial scrollback replay guard: set isResizingRef so the live
      // terminal-output listener doesn't interleave shell output (including
      // the fresh prompt from sendResize) with the scrollback replay — that
      // interleaving is what produces the "eecho" corruption (parser-level
      // line-wrap race). We release isResizingRef + publish dims only after
      // the initial replay chain completes.
      isResizingRef.current = true;
      const publishDims = (cols: number, rows: number) => {
        if (cols > 0 && rows > 0) {
          reportTerminalDims(sessionIdRef.current ?? '', cols, rows);
          sendResize(sessionIdRef.current, cols, rows);
        }
      };

      // Re-fit once fonts have loaded in case character metrics changed
      if (typeof document !== 'undefined' && document.fonts?.ready) {
        document.fonts.ready.then(() => {
          if (!disposedRef.current && fitAddonRef.current && termRef.current) {
            const rect = containerRef.current?.getBoundingClientRect();
            if (rect && rect.width > 0 && rect.height > 0) {
              fitAddonRef.current.fit();
              // Defer sendResize until after initial scrollback replay
              // completes (isResizingRef is released at that point).
              // If still resizing, the resize publish will happen after replay.
              if (!isResizingRef.current) {
                publishDims(termRef.current.cols, termRef.current.rows);
              }
            }
          }
        });
      }

      // Focus immediately and also after a short delay
      term.focus();
      const focusTimer = setTimeout(() => term.focus(), 100);

      termRef.current = term;
      fitAddonRef.current = fitAddon;
      canWriteRef.current = true; // terminal is now ready to accept input

      // NOTE: no .xterm-screen opacity hack here — the rgba theme background
      // already carries the transparency alpha. Fading the screen layer would
      // wash out the TEXT as well as the background.

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
              // Proactive anti-corruption: xterm's internal _reflowSmaller
              // (invoked by terminal.resize() inside fitAddon.fit()) corrupts
              // buffer lines when cols shrink — any residual OSC bytes in the
              // active xterm buffer cause byte-level garbling during reflow
              // (e.g. "echo" → "eecho"). We PREVENT it rather than recover:
              // (1) suspend live output writes, (2) reset xterm buffer so
              // _reflowSmaller has zero lines to corrupt, (3) fit at the new
              // col count, (4) re-emit sanitized scrollback, (5) resume writes
              // and send resize to PTY ONLY after replay completes — this
              // prevents the shell's fresh prompt from landing mid-reflow.
              isResizingRef.current = true;
              if (termRef.current && !disposedRef.current) {
                termRef.current.reset();
              }
              fitAddon.fit();
              if (termRef.current && sessionIdRef.current && !disposedRef.current) {
                invoke<string[]>('terminal_get_scrollback', { id: sessionIdRef.current })
                  .then((lines) => {
                    if (disposedRef.current || !termRef.current) return;
                    const replay = lines.length > 0 ? lines.join('\r\n') + '\r\n' : '';
                    writeChain = writeChain.then(() => {
                      if (disposedRef.current || !termRef.current) {
                        isResizingRef.current = false;
                        return;
                      }
                      if (replay) {
                        const cols = termRef.current.cols;
                        // Trim each line to the current col count to prevent
                        // xterm's parser from wrapping (which corrupts buffer
                        // lines as "eecho" when cols shrink). With windowsMode
                        // disabled reflow, lines wider than cols stay intact,
                        // but the parser still wraps them on write — trimming
                        // avoids that entirely.
                        for (const line of lines) {
                          const clean = stripOsc(line);
                          const trimmed = clean.length > cols ? clean.slice(0, cols) : clean;
                          termRef.current.writeln(trimmed);
                        }
                        termRef.current.writeln('');
                      }
                      // Resume live writes + publish new col/row to PTY.
                      // Delayed until AFTER replay so the shell's prompt
                      // doesn't race the reset+replay sequence.
                      isResizingRef.current = false;
                      // Defer sendResize by one macrotask so the xterm write
                      // queue fully drains before the shell emits its fresh
                      // prompt — this prevents parser-level interleaving.
                      setTimeout(() => {
                        if (termRef.current && !disposedRef.current && !isResizingRef.current) {
                          reportTerminalDims(sessionIdRef.current ?? '', termRef.current.cols, termRef.current.rows);
                          sendResize(sessionIdRef.current, termRef.current.cols, termRef.current.rows);
                        }
                      }, 0);
                    });
                  })
                  .catch(() => { isResizingRef.current = false; });
              } else {
                isResizingRef.current = false;
              }
            }
          }
        });
      });
      resizeObserver.observe(containerRef.current!);
      unlistenResizeCleanup = () => {
        resizeObserver.disconnect();
        cancelAnimationFrame(fitRaf);
        clearTimeout(focusTimer);
        if (publishDimsTimerRef.current) clearTimeout(publishDimsTimerRef.current);
      };

      term.onResize(({ cols, rows }) => {
        if (cols > 0 && rows > 0) {
          // Debounce: ignore rapid successive resizes, publish the settled size
          if (publishDimsTimerRef.current) clearTimeout(publishDimsTimerRef.current);
          publishDimsTimerRef.current = setTimeout(() => {
            if (!disposedRef.current) {
              reportTerminalDims(sessionIdRef.current ?? '', cols, rows);
              sendResize(sessionIdRef.current, cols, rows);
            }
          }, 50);
        }
      });

      // Forward keystrokes to the PTY
      term.onData((data) => {
        if (!canWriteRef.current || disposedRef.current) return;
        const id = sessionIdRef.current;
        if (id) {
          // Timestamp every keystroke so auto-launch can defer while typing.
          reportInputActivity(id);
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
        if (isResizingRef.current) return;
        if (awaitingSnapshot) {
          pendingEvents.push(event.payload.data);
          return;
        }
        writeChain = writeChain.then(() => {
          if (!disposedRef.current) term.write(stripOsc(event.payload.data));
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
              if (replay) {
                const cols = term?.cols ?? 80;
                for (const line of lines) {
                  const clean = stripOsc(line);
                  const trimmed = clean.length > cols ? clean.slice(0, cols) : clean;
                  term.writeln(trimmed);
                }
                term.writeln('');
              }
              if (tail) term.write(stripOsc(tail));
              // Initial replay complete: release the resize guard and publish
              // dims so the shell can render a fresh prompt at the correct
              // column count. Doing this AFTER replay prevents prompt output
              // from interleaving with scrollback replay (the "eecho" corruption).
              isResizingRef.current = false;
              publishDims(term.cols, term.rows);
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
              if (!disposedRef.current) term.write(stripOsc(tail));
              isResizingRef.current = false;
              publishDims(term?.cols ?? 0, term?.rows ?? 0);
            });
          });
      }
    }).catch(console.error);

    return () => {
      cancelled = true;
      disposedRef.current = true;
      initRef.current = false;
      isResizingRef.current = false;
      unlistenOutput?.();
      unlistenResizeCleanup?.();
      const term = termRef.current;
      termRef.current = null;
      fitAddonRef.current = null;
      if (term) {
        try {
          const core = (term as unknown as { _core?: XTermPrivateCore })._core;
          if (core?.viewport?._refreshAnimationFrame) {
            window.cancelAnimationFrame(core.viewport._refreshAnimationFrame);
            core.viewport._refreshAnimationFrame = null;
          }
          if (core?._renderService?._renderDebouncer?._animationFrame) {
            window.cancelAnimationFrame(core._renderService._renderDebouncer._animationFrame);
            core._renderService._renderDebouncer._animationFrame = null;
          }
        } catch {}
        term.dispose();
      }
    };
    // Intentional: theme colours / font size are applied by the dedicated
    // effect below. Adding them as deps here would tear down and rebuild the
    // xterm instance on every theme change, destroying scrollback and live
    // state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // Reactively update theme/transparency/font-size without tearing down the
  // terminal instance. Uses the supported xterm APIs — setOption triggers the
  // internal option-change render path (nested options.theme mutation does
  // not repaint), refresh() forces the canvas redraw, and the re-fit result
  // is published so the PTY never goes stale after a font-size change.
  useEffect(() => {
    const maybeTerm = termRef.current;
    if (!maybeTerm || disposedRef.current) return;
    // Narrowed non-null for nested closures below.
    const term: Terminal = maybeTerm;

    const newAlpha = Math.max(0, 1 - transparency / 100);
    const [r, g, b] = hexToRgb(theme.colors.bg);
    const newBg = `rgba(${r}, ${g}, ${b}, ${newAlpha})`;
    try {
      term.options.theme = {
        ...term.options.theme,
        background: newBg,
        foreground: theme.colors.text,
        cursor: theme.colors.accent,
        selectionBackground: withAlpha(theme.colors.accent, 0.2),
      };
    } catch {
      /* xterm not ready — canvas opacity fallback below still applies */
    }
    try {
      term.options.fontSize = fontSize;
    } catch {}
    try {
      const core = (term as unknown as { _core?: XTermPrivateCore })._core;
      const renderService = core?._renderService;
      if (term.rows > 0 && renderService?.hasRenderer?.()) {
        term.refresh(0, term.rows - 1);
      }
    } catch {}
    try {
      fitAddonRef.current?.fit();
      publishLiveDims();
    } catch {}

    function publishLiveDims() {
      if (term.cols > 0 && term.rows > 0) {
        reportTerminalDims(sessionIdRef.current ?? '', term.cols, term.rows);
        sendResize(sessionIdRef.current, term.cols, term.rows);
      }
    }
  }, [transparency, fontSize, sendResize]);

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
