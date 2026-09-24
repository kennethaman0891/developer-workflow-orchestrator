/**
 * useTerminalLayout — Layout state management for the terminal workspace.
 *
 * Persists panel positions, spans, and layout mode to localStorage so your
 * arrangement survives app restarts. Supports three modes:
 *
 *   grid    — freeform n×m grid, drag panels to reorder
 *   split-h — two panels side-by-side with a draggable divider
 *   split-v — two panels stacked vertically with a draggable divider
 *
 * Each panel occupies one or more grid cells. The grid auto-expands as you
 * add or resize panels.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { SessionMeta } from './useTerminals';

export interface Panel {
  id: string;
  /** 0-indexed column where the panel starts */
  col: number;
  /** 0-indexed row where the panel starts */
  row: number;
  /** Number of columns the panel spans */
  spanCol: number;
  /** Number of rows the panel spans */
  spanRow: number;
}

export type LayoutMode = 'grid' | 'split-h' | 'split-v';

export interface LayoutState {
  mode: LayoutMode;
  panels: Panel[];
  /** Which terminal is currently active / focused */
  activeId: string | null;
}

const STORAGE_KEY = 'dwo-terminal-layout';

function loadLayout(key: string): LayoutState | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as LayoutState;
  } catch {
    return null;
  }
}

function saveLayout(key: string, state: LayoutState) {
  try {
    localStorage.setItem(key, JSON.stringify(state));
  } catch {
    /* quota errors are non-fatal */
  }
}

/** Initialise a fresh layout: single full-width terminal. */
function initLayout(activeId: string): LayoutState {
  return {
    mode: 'grid',
    panels: [
      { id: activeId, col: 0, row: 0, spanCol: 1, spanRow: 1 },
    ],
    activeId,
  };
}

export function useTerminalLayout(
  sessions: SessionMeta[],
  setActiveId: (id: string) => void,
  storageKey: string = STORAGE_KEY,
) {
  // Initialize with empty/default state to ensure SSR/client consistency.
  // The actual layout is loaded from localStorage after mount in useEffect.
  const [layout, setLayout] = useState<LayoutState>({
    mode: 'grid',
    panels: [],
    activeId: null,
  });
  const hasMounted = useRef(false);

  // Load persisted layout after first render (client-side only)
  useEffect(() => {
    const saved = loadLayout(storageKey);
    if (saved && saved.panels.length > 0) {
      setLayout(saved);
    }
    hasMounted.current = true;
  }, [storageKey]);

  const [gridSize] = useState({ cols: 4, rows: 3 }); // visual grid size hint
  const persistRef = useRef(false);

  // Persist to localStorage whenever layout changes (debounced-ish via ref guard).
  useEffect(() => {
    if (persistRef.current) saveLayout(storageKey, layout);
    persistRef.current = true;
  }, [layout, storageKey]);

  // Sync activeId from external source (e.g. tab bar clicks).
  useEffect(() => {
    if (sessions.length > 0 && !layout.activeId) {
      const firstVisible = sessions.find((s) => s.visible) ?? sessions[0];
      if (firstVisible) setActiveId(firstVisible.id);
    }
  }, [sessions, layout.activeId, setActiveId]);

  const syncActiveFromSessions = useCallback(() => {
    // Keep activeId in sync with whichever session has focus=true
    const focused = sessions.find((s) => s.focus);
    if (focused && focused.id !== layout.activeId) {
      setLayout((prev) => ({ ...prev, activeId: focused.id }));
      setActiveId(focused.id);
    }
  }, [sessions, layout.activeId, setActiveId]);

  // ── Actions ────────────────────────────────────────────────────────────────

  /**
   * Find the first empty cell in the grid by scanning row-by-row, then
   * column-by-column. This ensures new panels never overlap existing ones,
   * even when some panels span multiple cells.
   */
  function findFirstEmptyCell(panels: Panel[]): { col: number; row: number } {
    // Scan up to a large grid size (more than enough for typical use)
    for (let row = 0; row < 20; row++) {
      for (let col = 0; col < 10; col++) {
        let occupied = false;
        for (const panel of panels) {
          // Check if (col, row) falls within this panel's bounds
          if (
            col >= panel.col &&
            col < panel.col + panel.spanCol &&
            row >= panel.row &&
            row < panel.row + panel.spanRow
          ) {
            occupied = true;
            break;
          }
        }
        if (!occupied) {
          return { col, row };
        }
      }
    }
    // Fallback (should never reach here)
    return { col: 0, row: 0 };
  }

  const addPanel = useCallback(
    (sessionId: string) => {
      setLayout((prev) => {
        // Don't add duplicate
        if (prev.panels.some((p) => p.id === sessionId)) return prev;
        const newPanels = [...prev.panels];
        if (newPanels.length === 0) {
          newPanels.push({ id: sessionId, col: 0, row: 0, spanCol: 1, spanRow: 1 });
        } else {
          // Find the first empty cell to avoid overlapping resized panels
          const pos = findFirstEmptyCell(newPanels);
          newPanels.push({ id: sessionId, col: pos.col, row: pos.row, spanCol: 1, spanRow: 1 });
        }
        return { ...prev, panels: newPanels, activeId: sessionId };
      });
      setActiveId(sessionId);
    },
    [setActiveId],
  );

  const removePanel = useCallback(
    (sessionId: string) => {
      setLayout((prev) => {
        const idx = prev.panels.findIndex((p) => p.id === sessionId);
        if (idx === -1) return prev;
        const newPanels = prev.panels.filter((p) => p.id !== sessionId);
        let newActive = prev.activeId;
        if (prev.activeId === sessionId) {
          newActive = newPanels[idx]?.id ?? newPanels[idx - 1]?.id ?? null;
        }
        return { ...prev, panels: newPanels, activeId: newActive };
      });
    },
    [],
  );

  const movePanel = useCallback((id: string, col: number, row: number) => {
    setLayout((prev) => ({
      ...prev,
      panels: prev.panels.map((p) =>
        p.id === id ? { ...p, col, row } : p,
      ),
    }));
  }, []);

  const resizePanel = useCallback((id: string, spanCol: number, spanRow: number) => {
    setLayout((prev) => ({
      ...prev,
      panels: prev.panels.map((p) =>
        p.id === id ? { ...p, spanCol: Math.max(1, spanCol), spanRow: Math.max(1, spanRow) } : p,
      ),
    }));
  }, []);

  const swapPanels = useCallback((idA: string, idB: string) => {
    setLayout((prev) => {
      const panels = prev.panels.map((p) => ({ ...p }));
      const idxA = panels.findIndex((p) => p.id === idA);
      const idxB = panels.findIndex((p) => p.id === idB);
      if (idxA === -1 || idxB === -1) return prev;
      const temp = { ...panels[idxA] };
      panels[idxA] = { ...panels[idxB] };
      panels[idxB] = temp;
      return { ...prev, panels };
    });
  }, []);

  const setMode = useCallback((mode: LayoutMode) => {
    setLayout((prev) => {
      if (prev.mode === mode) return prev;
      // Re-initialise panels for the new mode
      if (mode === 'split-h' && prev.panels.length >= 2) {
        return {
          ...prev,
          mode,
          panels: [
            { id: prev.panels[0].id, col: 0, row: 0, spanCol: 1, spanRow: 1 },
            { id: prev.panels[1].id, col: 1, row: 0, spanCol: 1, spanRow: 1 },
          ],
        };
      }
      if (mode === 'split-v' && prev.panels.length >= 2) {
        return {
          ...prev,
          mode,
          panels: [
            { id: prev.panels[0].id, col: 0, row: 0, spanCol: 1, spanRow: 1 },
            { id: prev.panels[1].id, col: 0, row: 1, spanCol: 1, spanRow: 1 },
          ],
        };
      }
      // For grid mode or insufficient panels, compact into top-left
      return {
        ...prev,
        mode,
        panels: prev.panels.map((p, i) => ({
          ...p,
          col: i % 2,
          row: Math.floor(i / 2),
          spanCol: 1,
          spanRow: 1,
        })),
      };
    });
  }, []);

  const focusPanel = useCallback(
    (id: string) => {
      setLayout((prev) => ({ ...prev, activeId: id }));
      setActiveId(id);
    },
    [setActiveId],
  );

  /**
   * Bring the layout in sync with the authoritative list of backend session
   * IDs. Panels whose sessions no longer exist (e.g. stale localStorage
   * layouts or closed terminals) are pruned; sessions that are running but
   * have no panel yet (e.g. auto-created terminals) get a panel placed next
   * to the last one. The caller decides when to run this (see TerminalLayout).
   */
  const syncPanels = useCallback((sessionIds: string[]) => {
    setLayout((prev) => {
      let changed = false;

      // Prune panels whose sessions no longer exist.
      const panels = prev.panels.filter((p) => {
        const keep = sessionIds.includes(p.id);
        if (!keep) changed = true;
        return keep;
      });

      // Add panels for sessions that are running but not yet in the layout.
      const existing = new Set(panels.map((p) => p.id));
      let lastAdded: string | null = null;
      for (const id of sessionIds) {
        if (existing.has(id)) continue;
        changed = true;
        lastAdded = id;
        // Find first empty cell to avoid overlapping resized panels
        const pos = findFirstEmptyCell(panels);
        panels.push({ id, col: pos.col, row: pos.row, spanCol: 1, spanRow: 1 });
      }

      if (!changed) return prev;

      // Keep a valid active panel: prefer the most recently added one so a
      // freshly created terminal is selected immediately.
      let activeId = lastAdded ?? prev.activeId;
      if (!activeId || !panels.some((p) => p.id === activeId)) {
        activeId = panels[0]?.id ?? null;
      }
      return { ...prev, panels, activeId };
    });
  }, []);

  return {
    layout,
    gridSize,
    syncActiveFromSessions,
    syncPanels,
    addPanel,
    removePanel,
    movePanel,
    resizePanel,
    swapPanels,
    setMode,
    focusPanel,
  };
}
