/**
 * TerminalLayout — Draggable, resizable multi-terminal workspace.
 *
 * Renders all terminal panels according to the current layout mode:
 *
 *   grid    — n×m CSS grid; drag panels to reorder
 *   split-h — two panels side-by-side with a draggable divider
 *   split-v — two panels stacked with a draggable divider
 *
 * The layout is persisted to localStorage and restored on next visit.
 */

'use client';

import React, { useState, useCallback, useRef, useEffect } from 'react';
import type { SessionMeta } from '@/hooks/useTerminals';
import { useTerminalLayout } from '@/hooks/useTerminalLayout';
import { useAutoLaunch, type PaneDimensions } from '@/hooks/useAutoLaunch';
import { getTerminalDims, waitForTerminalDims, forgetTerminalDims, msSinceInput } from '@/lib/terminalDims';
import { useSettings } from '@/contexts/SettingsContext';
import { TerminalPanel } from './TerminalPanel';

enum LayoutMode {
  GRID = 'grid',
  SPLIT_H = 'split-h',
  SPLIT_V = 'split-v',
}

// ── SVG icon helpers ─────────────────────────────────────────────────────────

const GridIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <rect x="1" y="1" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.2" />
    <rect x="8" y="1" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.2" />
    <rect x="1" y="8" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.2" />
    <rect x="8" y="8" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.2" />
  </svg>
);

const SplitHIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <rect x="1" y="1" width="12" height="5" rx="1" stroke="currentColor" strokeWidth="1.2" />
    <rect x="1" y="8" width="12" height="5" rx="1" stroke="currentColor" strokeWidth="1.2" />
  </svg>
);

const SplitVIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <rect x="1" y="1" width="5" height="12" rx="1" stroke="currentColor" strokeWidth="1.2" />
    <rect x="8" y="1" width="5" height="12" rx="1" stroke="currentColor" strokeWidth="1.2" />
  </svg>
);

// ── Vertical divider component (separate so it can manage its own drag state) ─

interface VDividerProps {
  pos: number;
  onPosChange: (pos: number) => void;
}

function VDivider({ pos, onPosChange }: VDividerProps) {
  const isDragging = useRef(false);
  const startY = useRef(0);
  const startRatio = useRef(0.5);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      isDragging.current = true;
      startY.current = e.clientY;
      startRatio.current = pos;
      document.body.style.cursor = 'row-resize';
      document.body.style.userSelect = 'none';
    },
    [pos],
  );

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      const rect = (e.target as Element)?.closest('[data-split-container]')?.getBoundingClientRect();
      if (!rect) return;
      const delta = (e.clientY - startY.current) / rect.height;
      onPosChange(Math.max(0.15, Math.min(0.85, startRatio.current + delta)));
    };
    const handleMouseUp = () => {
      isDragging.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [onPosChange]);

  return (
    <div
      onMouseDown={handleMouseDown}
      data-split-container="true"
      className="dwo-divider-v"
      style={{
        height: '6px',
        cursor: 'row-resize',
        background: 'var(--dwo-color-border, #2a2a2a)',
        flexShrink: 0,
        transition: 'background 0.15s',
      }}
    />
  );
}

// ── Horizontal divider component ─────────────────────────────────────────────

interface HDividerProps {
  pos: number;
  onPosChange: (pos: number) => void;
}

function HDivider({ pos, onPosChange }: HDividerProps) {
  const isDragging = useRef(false);
  const startX = useRef(0);
  const startRatio = useRef(0.5);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      isDragging.current = true;
      startX.current = e.clientX;
      startRatio.current = pos;
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    },
    [pos],
  );

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      const rect = (e.target as Element)?.closest('[data-split-container]')?.getBoundingClientRect();
      if (!rect) return;
      const delta = (e.clientX - startX.current) / rect.width;
      onPosChange(Math.max(0.15, Math.min(0.85, startRatio.current + delta)));
    };
    const handleMouseUp = () => {
      isDragging.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [onPosChange]);

  return (
    <div
      onMouseDown={handleMouseDown}
      data-split-container="true"
      className="dwo-divider-h"
      style={{
        width: '6px',
        cursor: 'col-resize',
        background: 'var(--dwo-color-border, #2a2a2a)',
        flexShrink: 0,
        transition: 'background 0.15s',
      }}
    />
  );
}

// ── Main component ───────────────────────────────────────────────────────────

interface TerminalLayoutProps {
  sessions: SessionMeta[];
  /** Default shell path used when the user clicks "+ Terminal" */
  defaultShell?: string;
  /** Called to create a new terminal session (wired to useTerminals.create) */
  onCreate?: () => void;
  /** Called to close a terminal session (wired to useTerminals.close) */
  onCloseSession?: (id: string) => void;
  /** Per-workspace localStorage key so Open Code / Cloud Code keep separate layouts */
  layoutKey?: string;
  /** CLI command to auto-launch in every pane (from workspace.command) */
  autoLaunchCommand?: string | null;
  /** Whether auto-exec permission is enabled */
  autoLaunchEnabled?: boolean;
  /**
   * Called after auto-launch finishes — lets the parent re-list sessions so
   * `is_tui` (set during launch) reaches the TUI auto-expand effect promptly.
   */
  onAutoLaunched?: () => void;
  /** Called when the active terminal changes — used by the handoff panel at app level */
  onActiveSessionChange?: (id: string | null) => void;
  /** Last backend failure — rendered as a banner instead of a false empty state */
  backendError?: string | null;
  /** Dismiss the backend error banner */
  onClearBackendError?: () => void;
}

export function TerminalLayout({
  sessions,
  defaultShell: _defaultShell,
  onCreate,
  onCloseSession,
  layoutKey,
  autoLaunchCommand,
  autoLaunchEnabled,
  onAutoLaunched,
  onActiveSessionChange,
  backendError,
  onClearBackendError,
}: TerminalLayoutProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
  // Sync the active session id upward so the app-level HandoffPanel always
  // knows which terminal is currently in focus (fallback: first session).
  useEffect(() => {
    onActiveSessionChange?.(activeId);
  }, [activeId, onActiveSessionChange]);

  const {
    layout,
    layoutLoaded,
    syncActiveFromSessions,
    syncPanels,
    removePanel,
    resizePanel,
    swapPanels,
    setMode,
    focusPanel,
  } = useTerminalLayout(sessions, setActiveId, layoutKey);

  // Real xterm font size — used for the auto-launch pre-resize estimate so
  // the PTY is sized with the same metrics the terminal actually fits with.
  const { fontSize } = useSettings();
  // Terminal chrome follows the active theme (via CSS variables) instead of
  // hardcoded dark values. The `theme` token object is not destructured here
  // because every color reference below resolves through `var(--dwo-*)`.
  const chrome = {
    containerBg: 'var(--dwo-color-bg)',
    toolbarBg: 'var(--dwo-color-bg-secondary)',
    border: 'var(--dwo-color-border)',
    accent: 'var(--dwo-color-accent)',
    text: 'var(--dwo-color-text)',
    textMuted: 'var(--dwo-color-text-muted)',
    panelBg: 'var(--dwo-color-bg-tertiary)',
  };

  const gridContainerRef = useRef<HTMLDivElement>(null);

  // Drag-and-drop state for grid reordering
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);

  // Split-mode divider position
  const [splitPos, setSplitPos] = useState(0.5);

  // ── Auto-launch CLI in all panes ─────────────────────────────────────────
  const { autoLaunch, preResizePanes, computePtyDimensions } = useAutoLaunch();
  const launchedKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!autoLaunchCommand || !autoLaunchEnabled || !sessions || sessions.length === 0) return;

    const launchKey = `${autoLaunchCommand}:${sessions.map((s) => s.id).join(',')}`;
    if (launchedKeyRef.current === launchKey) return;
    launchedKeyRef.current = launchKey;

    const run = async () => {
      // Wait for shells to reach a prompt (scaled delay — login shells with
      // nvm/cargo/compinit rc files can take 2-3s to fully start).
      const sessionIds = sessions.map((s) => s.id);
      const n = sessionIds.length;
      const delay = Math.min(2500, 1000 + n * 400);
      await new Promise((r) => setTimeout(r, delay));

      // Wait for xterm instances to report their actually-fitted dimensions.
      await waitForTerminalDims(sessionIds, 2000);

      // Don't inject the command into a prompt the user is actively typing
      // in — defer once (up to 3s) so keystrokes and send_command can't
      // interleave into a garbled line. After the grace window we proceed so
      // a held key can never block the launch forever.
      const TYPING_QUIET_MS = 1500;
      const allQuiet = () => sessionIds.every((id) => msSinceInput(id) > TYPING_QUIET_MS);
      if (!allQuiet()) {
        await new Promise((r) => setTimeout(r, 3000));
      }

      const container = gridContainerRef.current;
      const dimensions: PaneDimensions[] = [];
      for (const s of sessions) {
        // Prefer the exact xterm-fitted dimensions (zero corrective resize).
        const fitted = getTerminalDims(s.id);
        if (fitted) {
          dimensions.push({ sessionId: s.id, cols: fitted.cols, rows: fitted.rows });
          continue;
        }
        // Fallback: estimate from the panel element, but ONLY when it is
        // actually visible. A 0×0 measurement (maximized sibling under
        // display:none, or split modes where the grid container is unmounted)
        // used to floor to 160×80px → a 20×5 PTY right before the CLI launch.
        // Maximized placeholders carry aria-hidden + no TerminalPanel, so the
        // :not() selector can never resolve to one of them.
        const panelEl = container?.querySelector(
          `[data-panel-id="${s.id}"]:not([aria-hidden="true"])`,
        ) as HTMLElement | null;
        if (panelEl) {
          const panelRect = panelEl.getBoundingClientRect();
          if (panelRect.width > 0 && panelRect.height > 0) {
            const dims = computePtyDimensions(panelRect.width - 4, panelRect.height - 36, fontSize);
            dimensions.push({ sessionId: s.id, cols: dims.cols, rows: dims.rows });
          }
        }
        // Otherwise skip the pre-resize: the PTY keeps its last fitted size
        // (or the 80×24 default) while invisible and self-corrects on show.
      }

      // Pre-resize PTYs to their real dimensions
      await preResizePanes(dimensions);

      // Launch the command (staggered 200ms apart)
      await autoLaunch({
        command: autoLaunchCommand,
        sessionIds,
        enabled: true,
      });

      // Re-list sessions so is_tui (set during auto-launch) reaches the
      // parent and the TUI auto-expand effect fires promptly.
      onAutoLaunched?.();
    };

    run().catch(console.error);
  }, [sessions, autoLaunchCommand, autoLaunchEnabled, autoLaunch, preResizePanes, computePtyDimensions, fontSize, onAutoLaunched]);

  // ── TUI auto-expand: maximize when any session enters TUI mode ─────────
  // Truce rules: fires at most once per session (autoMaxRef) so a manual
  // restore is never re-stolen on a later re-list; when OUR auto-maximized
  // session exits TUI mode the layout restores itself instead of leaving the
  // user stuck maximized. Closed sessions are pruned to bound growth.
  const autoMaxRef = useRef<Set<string>>(new Set());
  const autoMaxIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!sessions || sessions.length === 0) return;
    const liveIds = new Set(sessions.map((s) => s.id));
    for (const id of Array.from(autoMaxRef.current)) {
      if (!liveIds.has(id)) autoMaxRef.current.delete(id);
    }
    // Our auto-maximized session left TUI mode → give the grid back.
    if (autoMaxIdRef.current) {
      const auto = sessions.find((s) => s.id === autoMaxIdRef.current);
      if (!auto) {
        autoMaxIdRef.current = null;
      } else if (!auto.is_tui && maximizedId === auto.id) {
        autoMaxIdRef.current = null;
        setMaximizedId(null);
        return;
      }
    }
    const tuiSession = sessions.find((s) => s.is_tui && !autoMaxRef.current.has(s.id));
    if (tuiSession && maximizedId !== tuiSession.id) {
      autoMaxRef.current.add(tuiSession.id);
      autoMaxIdRef.current = tuiSession.id;
      setMaximizedId(tuiSession.id);
      prevModeRef.current = layout.mode;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessions]);

  // ── Sync active from backend focus events ──────────────────────────────────
  useEffect(() => {
    syncActiveFromSessions();
  }, [sessions, syncActiveFromSessions]);

  // ── Sync panels with backend sessions ─────────────────────────────────────
  const loadedOnceRef = useRef(false);
  useEffect(() => {
    if ((!sessions || sessions.length === 0) && !loadedOnceRef.current) return;
    loadedOnceRef.current = true;
    syncPanels(sessions.map((s) => s.id));
  }, [sessions, syncPanels]);

  // Auto-fallback to grid mode when panel count is not 2 but layout is split-h/split-v.
  // This handles persisted layouts where user had 2 panels in split mode,
  // then added/removed terminals making panel count != 2.
  

  // Convert sessions array to Map for O(1) lookups by ID
  const sessionsMap = React.useMemo(() =>
    new Map(sessions.map(session => [session.id, session])),
    [sessions]
  );

  // Filter panels to only those that actually exist in the current sessions
  const validPanels = layoutLoaded ? layout.panels.filter((p) => sessionsMap.has(p.id)) : [];

  // Auto-fallback to grid mode when panel count is not 2 but layout is split-h/split-v.
  // This handles persisted layouts where user had 2 panels in split mode,
  // then added/removed terminals making panel count != 2.
  useEffect(() => {
    if (layoutLoaded && validPanels.length < 2 && (layout.mode === LayoutMode.SPLIT_H || layout.mode === LayoutMode.SPLIT_V)) {
      setMode(LayoutMode.GRID);
    }
  }, [layoutLoaded, validPanels.length, layout.mode, setMode]);

  // ── Create terminal helper ─────────────────────────────────────────────────
  const handleCreate = useCallback(() => {
    onCreate?.();
  }, [onCreate]);

  // ── Drag handlers for grid reorder ─────────────────────────────────────────
  const handlePanelDragStart = useCallback((id: string) => {
    setDraggedId(id);
  }, []);

  const handlePanelDragOver = useCallback((e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (draggedId && draggedId !== targetId) {
      setDropTargetId(targetId);
    }
  }, [draggedId]);

  const handlePanelDrop = useCallback(() => {
    if (draggedId && dropTargetId && draggedId !== dropTargetId) {
      swapPanels(draggedId, dropTargetId);
    }
    setDraggedId(null);
    setDropTargetId(null);
  }, [draggedId, dropTargetId, swapPanels]);

  // ── Close handler ──────────────────────────────────────────────────────────
  const handleClose = useCallback(
    (id: string) => {
      forgetTerminalDims(id);
      removePanel(id);
      onCloseSession?.(id);
    },
    [removePanel, onCloseSession],
  );

  // ── Maximize / restore ─────────────────────────────────────────────────────
  const [maximizedId, setMaximizedId] = useState<string | null>(null);
  const prevModeRef = useRef<'grid' | 'split-h' | 'split-v' | null>(null);

  const handleMaximize = useCallback(
    (id: string) => {
      setMaximizedId((prev) => {
        if (prev === id) {
          return null;
        }
        prevModeRef.current = layout.mode;
        return id;
      });
    },
    [layout.mode],
  );

  // Shared toolbar (mode buttons + terminal count). Rendered in EVERY state —
  // including empty/restoring/syncing — so the layout controls never
  // disappear when no terminal is currently present. The chosen mode is
  // persisted and applies to the next terminal that is created.
  // Split modes (side-by-side / stacked) only work with exactly 2 terminals.
  const canSplit = validPanels.length >= 2;
  const toolbar = (
    <div
      style={{
        ...toolbarStyle,
        background: chrome.toolbarBg,
        borderBottom: `1px solid ${chrome.border}`,
      }}
    >
      {maximizedId && (
        <button
          onClick={() => setMaximizedId(null)}
          style={{
            ...createBtnStyle,
            background: chrome.panelBg,
            color: chrome.text,
            border: `1px solid ${chrome.border}`,
            marginRight: '8px',
          }}
        >
          ⤓ Restore
        </button>
      )}

      <div style={{ ...modeGroupStyle, background: chrome.panelBg }}>
        <button
          onClick={() => setMode(LayoutMode.GRID)}
          style={modeBtnStyle(layout.mode === LayoutMode.GRID, chrome.accent, chrome.textMuted)}
          title="Grid layout"
        >
          <GridIcon />
        </button>
        <button
          onClick={() => canSplit && setMode(LayoutMode.SPLIT_H)}
          disabled={!canSplit}
          style={modeBtnStyle(layout.mode === LayoutMode.SPLIT_H, chrome.accent, canSplit ? chrome.textMuted : chrome.border)}
          title={canSplit ? "Side-by-side split" : "Requires at least 2 terminals"}
        >
          <SplitHIcon />
        </button>
        <button
          onClick={() => canSplit && setMode(LayoutMode.SPLIT_V)}
          disabled={!canSplit}
          style={modeBtnStyle(layout.mode === LayoutMode.SPLIT_V, chrome.accent, canSplit ? chrome.textMuted : chrome.border)}
          title={canSplit ? "Stacked split" : "Requires at least 2 terminals"}
        >
          <SplitVIcon />
        </button>
      </div>

      <span style={{ ...countStyle, color: chrome.textMuted }}>
        {(sessions?.length ?? 0)} terminal{(sessions?.length ?? 0) !== 1 ? 's' : ''}
      </span>
    </div>
  );

  // ── Render: empty state ───────────────────────────────────────────────────
  if (!sessions || sessions.length === 0) {
    return (
      <div data-split-container="true" style={{ ...containerStyle, background: chrome.containerBg }}>
        {toolbar}
        {backendError && (
          <div
            role="alert"
            style={{
              padding: '8px 12px',
              background: '#ff6b6b22',
              borderBottom: '1px solid #ff6b6b44',
              color: '#ff9999',
              fontSize: '12px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <span style={{ flex: 1 }}>⚠️ Terminal backend error: {backendError}</span>
            <button
              type="button"
              onClick={onClearBackendError}
              style={{
                background: 'transparent',
                border: '1px solid #ff6b6b44',
                color: '#ff9999',
                borderRadius: '3px',
                cursor: 'pointer',
                fontSize: '11px',
                padding: '2px 8px',
              }}
            >
              Dismiss
            </button>
          </div>
        )}
        <div style={emptyStyle}>
          <div style={{ fontSize: '28px', marginBottom: '8px' }}>⌘</div>
          <div style={{ color: chrome.textMuted, fontSize: '14px' }}>
            {backendError ? 'Terminals unavailable' : 'No terminals yet'}
          </div>
          <button onClick={handleCreate} style={{ ...createBtnStyle, background: chrome.accent, marginTop: '12px' }}>
            + Terminal
          </button>
        </div>
      </div>
    );
  }

  // Layout still restoring from storage — never flash a false empty state or
  // a half-built grid while sessions already exist.
  if (!layoutLoaded && sessions && sessions.length > 0) {
    return (
      <div data-split-container="true" style={{ ...containerStyle, background: chrome.containerBg }}>
        {toolbar}
        <div style={emptyStyle}>
          <div style={{ color: chrome.textMuted, fontSize: '13px' }}>Restoring layout…</div>
        </div>
      </div>
    );
  }

  // ── Render: split-h (side-by-side split with horizontal scroll for 2+ panels) ──
  // Shows all panels in a horizontal scrollable row with draggable divider between first two.
  if (layout.mode === LayoutMode.SPLIT_H && validPanels.length >= 2 && !maximizedId) {
    const sessions = validPanels.map(p => sessionsMap.get(p.id)).filter(Boolean) as SessionMeta[];
    if (sessions.length < 2) {
      return (
        <div data-split-container="true" style={{ ...containerStyle, background: chrome.containerBg }}>
          {toolbar}
          <div style={emptyStyle}>
            <div style={{ color: chrome.textMuted, fontSize: '13px' }}>Syncing terminals…</div>
          </div>
        </div>
      );
    }

    // For 2 panels: show divider. For 3+: show all in single horizontal scroll.
    const showDivider = sessions.length === 2;

    return (
      <div data-split-container="true" style={{ ...containerStyle, flexDirection: 'column', overflow: 'visible' }}>
        {toolbar}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'row', minHeight: 0, overflow: 'visible' }}>
          {showDivider ? (
            // Exactly 2 panels: traditional split with divider
            <>
              <div style={{ width: `${splitPos * 100}%`, flex: 'none', display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
                <TerminalPanel
                  id={sessions[0]!.id}
                  title={sessions[0]!.title}
                  visible={sessions[0]!.visible}
                  isActive={sessions[0]!.id === activeId}
                  isMaximized={false}
                  isTui={sessions[0]!.is_tui}
                  onClose={() => handleClose(sessions[0]!.id)}
                  onFocus={() => focusPanel(sessions[0]!.id)}
                  onMaximize={() => handleMaximize(sessions[0]!.id)}
                />
              </div>
              <HDivider pos={splitPos} onPosChange={setSplitPos} />
              <div style={{ width: `${(1 - splitPos) * 100}%`, flex: 'none', display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
                <TerminalPanel
                  id={sessions[1]!.id}
                  title={sessions[1]!.title}
                  visible={sessions[1]!.visible}
                  isActive={sessions[1]!.id === activeId}
                  isMaximized={false}
                  isTui={sessions[1]!.is_tui}
                  onClose={() => handleClose(sessions[1]!.id)}
                  onFocus={() => focusPanel(sessions[1]!.id)}
                  onMaximize={() => handleMaximize(sessions[1]!.id)}
                />
              </div>
            </>
          ) : (
            // 3+ panels: single horizontal scrollable row with all panels
            <div
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'row',
                gap: '6px',
                padding: '6px',
                overflow: 'auto',
                minHeight: 0,
                minWidth: 0,
              }}
            >
              {sessions.map((s) => (
                <div
                  key={s.id}
                  style={{
                    flex: '1 1 300px',
                    minWidth: '300px',
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden',
                  }}
                >
                  <TerminalPanel
                    id={s.id}
                    title={s.title}
                    visible={s.visible}
                    isActive={s.id === activeId}
                    isMaximized={false}
                    isTui={s.is_tui}
                    onClose={() => handleClose(s.id)}
                    onFocus={() => focusPanel(s.id)}
                    onMaximize={() => handleMaximize(s.id)}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }// ── Render: split-v (stacked split with vertical scroll for 2+ panels) ──
  // Shows all panels in a vertical scrollable column with draggable divider between first two.
  if (layout.mode === LayoutMode.SPLIT_V && validPanels.length >= 2 && !maximizedId) {
    const sessions = validPanels.map(p => sessionsMap.get(p.id)).filter(Boolean) as SessionMeta[];
    if (sessions.length < 2) {
      return (
        <div data-split-container="true" style={{ ...containerStyle, background: chrome.containerBg }}>
          {toolbar}
          <div style={emptyStyle}>
            <div style={{ color: chrome.textMuted, fontSize: '13px' }}>Syncing terminals…</div>
          </div>
        </div>
      );
    }

    // For 2 panels: show divider. For 3+: show all in single vertical scroll.
    const showDivider = sessions.length === 2;

    return (
      <div data-split-container="true" style={{ ...containerStyle, flexDirection: 'column', overflow: 'visible' }}>
        {toolbar}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'visible' }}>
          {showDivider ? (
            // Exactly 2 panels: traditional split with divider
            <>
              <div style={{ height: `${splitPos * 100}%`, flex: 'none', display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
                <TerminalPanel
                  id={sessions[0]!.id}
                  title={sessions[0]!.title}
                  visible={sessions[0]!.visible}
                  isActive={sessions[0]!.id === activeId}
                  isMaximized={false}
                  isTui={sessions[0]!.is_tui}
                  onClose={() => handleClose(sessions[0]!.id)}
                  onFocus={() => focusPanel(sessions[0]!.id)}
                  onMaximize={() => handleMaximize(sessions[0]!.id)}
                />
              </div>
              <VDivider pos={splitPos} onPosChange={setSplitPos} />
              <div style={{ height: `${(1 - splitPos) * 100}%`, flex: 'none', display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
                <TerminalPanel
                  id={sessions[1]!.id}
                  title={sessions[1]!.title}
                  visible={sessions[1]!.visible}
                  isActive={sessions[1]!.id === activeId}
                  isMaximized={false}
                  isTui={sessions[1]!.is_tui}
                  onClose={() => handleClose(sessions[1]!.id)}
                  onFocus={() => focusPanel(sessions[1]!.id)}
                  onMaximize={() => handleMaximize(sessions[1]!.id)}
                />
              </div>
            </>
          ) : (
            // 3+ panels: single vertical scrollable column with all panels
            <div
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
                padding: '6px',
                overflow: 'auto',
                minWidth: 0,
                minHeight: 0,
              }}
            >
              {sessions.map((s) => (
                <div
                  key={s.id}
                  style={{
                    flex: '1 1 200px',
                    minHeight: '200px',
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden',
                  }}
                >
                  <TerminalPanel
                    id={s.id}
                    title={s.title}
                    visible={s.visible}
                    isActive={s.id === activeId}
                    isMaximized={false}
                    isTui={s.is_tui}
                    onClose={() => handleClose(s.id)}
                    onFocus={() => focusPanel(s.id)}
                    onMaximize={() => handleMaximize(s.id)}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }// ── Render: grid mode ──────────────────────────────────────────────────────
  // Calculate grid dimensions from ACTUAL panel positions and spans of valid sessions.
  const numPanels = validPanels.length;
  // If there's only 1 panel, ensure it is at (0,0) and spans (1,1) so it fills the workspace
  const normalizedPanels = numPanels <= 1
    ? (validPanels.length === 1 ? [{ ...validPanels[0], col: 0, row: 0, spanCol: 1, spanRow: 1 }] : [])
    : validPanels;

  let maxCol = 0;
  let maxRow = 0;
  for (const panel of normalizedPanels) {
    maxCol = Math.max(maxCol, panel.col + panel.spanCol);
    maxRow = Math.max(maxRow, panel.row + panel.spanRow);
  }
  // When a panel is maximized, force 1×1 single cell taking 100% width and height.
  // When there is only 1 panel, use 1 column so it fills the full workspace width.
  // When there are 2 or more panels, ensure at least 2 columns for grid arrangement.
  const totalCols = maximizedId ? 1 : (numPanels <= 1 ? 1 : Math.max(2, maxCol));
  const totalRows = maximizedId ? 1 : Math.max(1, maxRow);

  return (
    <div
      data-split-container="true"
      style={{ ...containerStyle, background: chrome.containerBg }}
    >
      {/* Toolbar (shared — defined above so it survives every state) */}
      {toolbar}

      {/* Grid */}
      {validPanels.length === 0 ? (
        <div style={emptyStyle}>
          <div style={{ fontSize: '28px', marginBottom: '8px' }}>⌘</div>
          <div style={{ color: chrome.textMuted, fontSize: '14px' }}>No terminals yet</div>
          <button onClick={handleCreate} style={{ ...createBtnStyle, background: chrome.accent, marginTop: '12px' }}>
            + Terminal
          </button>
        </div>
      ) : (
        <div
          ref={gridContainerRef}
          style={{
            flex: 1,
            display: 'grid',
            gridTemplateColumns: `repeat(${totalCols}, 1fr)`,
            gridTemplateRows: `repeat(${totalRows}, 1fr)`,
            gap: maximizedId ? '0' : '6px',
            padding: maximizedId ? '4px' : '8px',
            overflow: 'hidden',
            minHeight: 0,
            minWidth: 0,
          }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={handlePanelDrop}
        >
          {normalizedPanels.map((panel) => {
            const session = sessionsMap.get(panel.id);
            if (!session) return null;
            const isDragSource = draggedId === panel.id;
            const isDropTarget = dropTargetId === panel.id;
            const isMaximized = maximizedId === panel.id;

            // When a panel is maximized, siblings stay out of the tree entirely.
            // Previously they were kept mounted under `display:none` — but each
            // hidden sibling still mounted an xterm instance whose fit loop
            // (retry-fit + ResizeObserver + fonts.ready + waitForTerminalDims)
            // could never observe a non-zero rect, storming resizes in prod.
            // State is preserved by the layout/panel model, not by keeping
            // invisible terminals alive.
            if (maximizedId && !isMaximized) {
              return (
                <div
                  key={panel.id}
                  data-panel-id={panel.id}
                  style={{ display: 'none' }}
                  aria-hidden="true"
                />
              );
            }

            return (
              <div
                key={panel.id}
                data-panel-id={panel.id}
                data-span-col={panel.spanCol}
                data-span-row={panel.spanRow}
                onDragOver={(e) => handlePanelDragOver(e, panel.id)}
                onDrop={handlePanelDrop}
                style={{
                  display: 'flex',
                  gridColumn: isMaximized ? '1' : `${panel.col + 1} / span ${panel.spanCol}`,
                  gridRow: isMaximized ? '1' : `${panel.row + 1} / span ${panel.spanRow}`,
                  opacity: isDragSource ? 0.4 : 1,
                  outline: isDropTarget ? `2px dashed ${chrome.accent}` : 'none',
                  outlineOffset: '-2px',
                  borderRadius: '10px',
                  overflow: 'hidden',
                  transition: 'opacity 0.15s, outline 0.15s',
                  minHeight: 0,
                  minWidth: 0,
                  padding: isMaximized ? '0' : '6px',
                  width: '100%',
                  height: '100%',
                }}
              >
                <TerminalPanel
                  id={session.id}
                  title={session.title}
                  visible={session.visible}
                  isActive={session.id === activeId}
                  isMaximized={isMaximized}
                  isTui={session.is_tui}
                  onClose={() => handleClose(session.id)}
                  onFocus={() => focusPanel(session.id)}
                  onMaximize={() => handleMaximize(session.id)}
                  onDragStart={() => handlePanelDragStart(panel.id)}
                  onResize={(spanCol, spanRow) => resizePanel(session.id, spanCol, spanRow)}
                  gridContainerRef={gridContainerRef}
                  gridCols={totalCols}
                  gridRows={totalRows}
                />
              </div>
            );
          })}
        </div>
      )}

    </div>
  );
}

// ── Style constants ──────────────────────────────────────────────────────────

const containerStyle: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  background: '#0a0a0a',
  minHeight: 0,
  minWidth: 0,
};

const toolbarStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  padding: '6px 10px',
  borderBottom: '1px solid #2a2a2a',
  background: '#111111',
  flexShrink: 0,
};

const createBtnStyle: React.CSSProperties = {
  background: '#4a9eff',
  color: '#fff',
  border: 'none',
  padding: '4px 12px',
  borderRadius: '4px',
  cursor: 'pointer',
  fontSize: '12px',
  fontWeight: 500,
};

const modeGroupStyle: React.CSSProperties = {
  display: 'flex',
  gap: '2px',
  background: '#1a1a1a',
  borderRadius: '4px',
  padding: '2px',
  marginLeft: 'auto',
};

const countStyle: React.CSSProperties = {
  color: '#666',
  fontSize: '11px',
  marginLeft: '4px',
};

const emptyStyle: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  color: '#555',
};

const maximizedWrapStyle: React.CSSProperties = {
  flex: 1,
  position: 'relative',
  display: 'flex',
  flexDirection: 'column',
  minHeight: 0,
  minWidth: 0,
};

const restoreBtnStyle: React.CSSProperties = {
  position: 'absolute',
  top: '8px',
  right: '8px',
  zIndex: 10,
  background: '#1a1a1a',
  border: '1px solid #2a2a2a',
  color: '#e8e8e8',
  padding: '4px 8px',
  cursor: 'pointer',
  borderRadius: '4px',
  fontSize: '12px',
};

function modeBtnStyle(active: boolean, accent: string, muted: string): React.CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '28px',
    height: '28px',
    background: active ? `${accent}33` : 'transparent',
    border: active ? `1px solid ${accent}66` : '1px solid transparent',
    borderRadius: '3px',
    cursor: 'pointer',
    color: active ? accent : muted,
    transition: 'all 0.15s',
  };
}
