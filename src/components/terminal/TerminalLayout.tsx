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

import { useState, useCallback, useRef, useEffect } from 'react';
import { SessionMeta } from '@/hooks/useTerminals';
import { useTerminalLayout } from '@/hooks/useTerminalLayout';
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
      style={{
        height: '6px',
        cursor: 'row-resize',
        background: '#2a2a2a',
        flexShrink: 0,
        transition: 'background 0.15s',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = '#4a9eff')}
      onMouseLeave={(e) => (e.currentTarget.style.background = '#2a2a2a')}
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
      style={{
        width: '6px',
        cursor: 'col-resize',
        background: '#2a2a2a',
        flexShrink: 0,
        transition: 'background 0.15s',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = '#4a9eff')}
      onMouseLeave={(e) => (e.currentTarget.style.background = '#2a2a2a')}
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
}

export function TerminalLayout({ sessions, defaultShell: _defaultShell, onCreate, onCloseSession, layoutKey }: TerminalLayoutProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const {
    layout,
    syncActiveFromSessions,
    syncPanels,
    removePanel,
    resizePanel,
    swapPanels,
    setMode,
    focusPanel,
  } = useTerminalLayout(sessions, setActiveId, layoutKey);

  const gridContainerRef = useRef<HTMLDivElement>(null);

  // Drag-and-drop state for grid reordering
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);

  // Split-mode divider positions
  const [splitPos, setSplitPos] = useState(0.5);

  // ── Sync active from backend focus events ──────────────────────────────────
  useEffect(() => {
    syncActiveFromSessions();
  }, [sessions.length, syncActiveFromSessions]);

  // ── Sync panels with backend sessions ─────────────────────────────────────
  // Prune panels for dead sessions (stale localStorage layouts) and add panels
  // for any running session not yet in the layout (auto-created terminals).
  // The loadedOnce guard avoids clearing a valid saved layout before the first
  // `terminal_list` call has resolved with real data.
  const loadedOnceRef = useRef(false);
  useEffect(() => {
    if (sessions.length === 0 && !loadedOnceRef.current) return;
    loadedOnceRef.current = true;
    syncPanels(sessions.map((s) => s.id));
  }, [sessions, syncPanels]);

  // ── Create terminal helper ─────────────────────────────────────────────────
  // Delegates to the shared useTerminals path via the parent (TerminalPool) so
  // the session list is always consistent. The sync effect above will pick up
  // the new session and add its panel automatically.
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
      removePanel(id);
      // Also terminate the backend PTY session to prevent zombie processes
      onCloseSession?.(id);
    },
    [removePanel, onCloseSession],
  );

  // ── Maximize / restore ─────────────────────────────────────────────────────
  const [maximizedId, setMaximizedId] = useState<string | null>(null);

  const handleMaximize = useCallback(
    (id: string) => {
      setMaximizedId((prev) => (prev === id ? null : id));
    },
    [],
  );

  // ── Render: maximized single panel ─────────────────────────────────────────
  if (maximizedId) {
    const session = sessions.find((s) => s.id === maximizedId);
    if (!session) return null;
    return (
      <div style={containerStyle}>
        <div style={maximizedWrapStyle}>
          <button onClick={() => setMaximizedId(null)} style={restoreBtnStyle}>
            ⤓ Restore
          </button>
          <TerminalPanel
            id={session.id}
            title={session.title}
            visible={session.visible}
            isActive={session.id === activeId}
            onClose={() => handleClose(session.id)}
            onFocus={() => focusPanel(session.id)}
            onMaximize={() => handleMaximize(session.id)}
          />
        </div>
      </div>
    );
  }

  // ── Render: split-h ────────────────────────────────────────────────────────
  if (layout.mode === LayoutMode.SPLIT_H && layout.panels.length >= 2) {
    const p1 = layout.panels[0];
    const p2 = layout.panels[1];
    const s1 = sessions.find((s) => s.id === p1.id);
    const s2 = sessions.find((s) => s.id === p2.id);
    if (!s1 || !s2) return null;

    return (
      <div data-split-container="true" style={{ ...containerStyle, flexDirection: 'row' }}>
        <div style={{ width: `${splitPos * 100}%`, flex: 'none', display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
          <TerminalPanel
            id={s1.id}
            title={s1.title}
            visible={s1.visible}
            isActive={s1.id === activeId}
            onClose={() => handleClose(s1.id)}
            onFocus={() => focusPanel(s1.id)}
            onMaximize={() => handleMaximize(s1.id)}
          />
        </div>
        <HDivider pos={splitPos} onPosChange={setSplitPos} />
        <div style={{ width: `${(1 - splitPos) * 100}%`, flex: 'none', display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
          <TerminalPanel
            id={s2.id}
            title={s2.title}
            visible={s2.visible}
            isActive={s2.id === activeId}
            onClose={() => handleClose(s2.id)}
            onFocus={() => focusPanel(s2.id)}
            onMaximize={() => handleMaximize(s2.id)}
          />
        </div>
      </div>
    );
  }

  // ── Render: split-v ────────────────────────────────────────────────────────
  if (layout.mode === LayoutMode.SPLIT_V && layout.panels.length >= 2) {
    const p1 = layout.panels[0];
    const p2 = layout.panels[1];
    const s1 = sessions.find((s) => s.id === p1.id);
    const s2 = sessions.find((s) => s.id === p2.id);
    if (!s1 || !s2) return null;

    return (
      <div data-split-container="true" style={{ ...containerStyle, flexDirection: 'column' }}>
        <div style={{ height: `${splitPos * 100}%`, flex: 'none', display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
          <TerminalPanel
            id={s1.id}
            title={s1.title}
            visible={s1.visible}
            isActive={s1.id === activeId}
            onClose={() => handleClose(s1.id)}
            onFocus={() => focusPanel(s1.id)}
            onMaximize={() => handleMaximize(s1.id)}
          />
        </div>
        <VDivider pos={splitPos} onPosChange={setSplitPos} />
        <div style={{ height: `${(1 - splitPos) * 100}%`, flex: 'none', display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
          <TerminalPanel
            id={s2.id}
            title={s2.title}
            visible={s2.visible}
            isActive={s2.id === activeId}
            onClose={() => handleClose(s2.id)}
            onFocus={() => focusPanel(s2.id)}
            onMaximize={() => handleMaximize(s2.id)}
          />
        </div>
      </div>
    );
  }

  // ── Render: grid mode ──────────────────────────────────────────────────────
  const totalCols = Math.max(1, Math.ceil(layout.panels.length / 2));
  const totalRows = Math.ceil(layout.panels.length / totalCols);

  return (
    <div data-split-container="true" style={containerStyle}>
      {/* Toolbar */}
      <div style={toolbarStyle}>
        <button onClick={handleCreate} style={createBtnStyle}>
          + Terminal
        </button>

        <div style={modeGroupStyle}>
          <button
            onClick={() => setMode(LayoutMode.GRID)}
            style={modeBtnStyle(layout.mode === LayoutMode.GRID)}
            title="Grid layout"
          >
            <GridIcon />
          </button>
          <button
            onClick={() => setMode(LayoutMode.SPLIT_H)}
            style={modeBtnStyle(layout.mode === LayoutMode.SPLIT_H)}
            title="Side-by-side split"
          >
            <SplitHIcon />
          </button>
          <button
            onClick={() => setMode(LayoutMode.SPLIT_V)}
            style={modeBtnStyle(layout.mode === LayoutMode.SPLIT_V)}
            title="Stacked split"
          >
            <SplitVIcon />
          </button>
        </div>

        <span style={countStyle}>
          {sessions.length} terminal{sessions.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Grid */}
      {layout.panels.length === 0 ? (
        <div style={emptyStyle}>
          <div style={{ fontSize: '28px', marginBottom: '8px' }}>⌘</div>
          <div style={{ color: '#888', fontSize: '14px' }}>No terminals yet</div>
          <button onClick={handleCreate} style={{ ...createBtnStyle, marginTop: '12px' }}>
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
            gap: '6px',
            padding: '8px',
            overflow: 'auto',
            minHeight: 0,
          }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={handlePanelDrop}
        >
          {layout.panels.map((panel) => {
            const session = sessions.find((s) => s.id === panel.id);
            if (!session) return null;
            const isDragSource = draggedId === panel.id;
            const isDropTarget = dropTargetId === panel.id;

            return (
              <div
                key={panel.id}
                draggable
                data-span-col={panel.spanCol}
                data-span-row={panel.spanRow}
                onDragStart={() => handlePanelDragStart(panel.id)}
                onDragOver={(e) => handlePanelDragOver(e, panel.id)}
                onDrop={handlePanelDrop}
                style={{
                  display: 'flex',
                  gridColumn: panel.col + 1,
                  gridRow: panel.row + 1,
                  gridColumnEnd: `span ${panel.spanCol}`,
                  gridRowEnd: `span ${panel.spanRow}`,
                  opacity: isDragSource ? 0.4 : 1,
                  outline: isDropTarget ? '2px dashed #4a9eff' : 'none',
                  outlineOffset: '-2px',
                  borderRadius: '10px',
                  overflow: 'hidden',
                  transition: 'opacity 0.15s, outline 0.15s',
                  minHeight: 0,
                  minWidth: 0,
                }}
              >
                <TerminalPanel
                  id={session.id}
                  title={session.title}
                  visible={session.visible}
                  isActive={session.id === activeId}
                  onClose={() => handleClose(session.id)}
                  onFocus={() => focusPanel(session.id)}
                  onMaximize={() => handleMaximize(session.id)}
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
  padding: '8px',
  gap: '8px',
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

function modeBtnStyle(active: boolean): React.CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '28px',
    height: '28px',
    background: active ? '#4a9eff33' : 'transparent',
    border: active ? '1px solid #4a9eff66' : '1px solid transparent',
    borderRadius: '3px',
    cursor: 'pointer',
    color: active ? '#4a9eff' : '#888',
    transition: 'all 0.15s',
  };
}
