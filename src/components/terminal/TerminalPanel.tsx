/**
 * TerminalPanel — A draggable, resizable terminal card.
 *
 * Displays a single xterm.js terminal anchored to its session ID. Supports:
 *  - Reordering within a grid layout via HTML5 drag-and-drop (handled by parent)
 *  - Resizing the panel's grid span via bottom-right handle
 *  - Maximize / restore single-panel focus
 *  - Close button to remove the panel from the layout
 *
 * Resize works by updating the panel's grid span (spanCol/spanRow) in the
 * layout state, NOT by setting CSS dimensions. This ensures the grid layout
 * stays consistent and xterm.js re-fits correctly.
 */

'use client';

import { useRef, useState, useCallback, useEffect } from 'react';
import { TerminalAnchor } from './TerminalAnchor';
import { useSettings } from '@/contexts/SettingsContext';
import { useTheme } from '@/contexts/ThemeContext';

export interface PanelProps {
  id: string;
  title: string;
  visible: boolean;
  isActive: boolean;
  isMaximized?: boolean;
  /** Session is running a TUI — xterm scrollback replay is skipped */
  isTui?: boolean;
  onClose: () => void;
  onFocus: () => void;
  onMaximize: () => void;
  onDragStart?: () => void;
  /** Called with new grid spans when the user finishes dragging the resize handle */
  onResize?: (spanCol: number, spanRow: number) => void;
  /** Grid container dimensions, used to convert pixel deltas to span changes */
  gridContainerRef?: React.RefObject<HTMLDivElement | null>;
  gridCols?: number;
  gridRows?: number;
}

export function TerminalPanel({
  id,
  title,
  visible,
  isActive,
  isMaximized = false,
  isTui = false,
  onClose,
  onFocus,
  onMaximize,
  onDragStart,
  onResize,
  gridContainerRef,
  gridCols = 1,
  gridRows = 1,
}: PanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [resizeStart, setResizeStart] = useState<{ x: number; y: number; spanCol: number; spanRow: number } | null>(null);
  const [currentSpan, setCurrentSpan] = useState<{ spanCol: number; spanRow: number } | null>(null);

  // Pull transparency from global settings so every terminal respects the user's choice
  const { transparency } = useSettings();
  const { theme } = useTheme();

  /** Hex #rrggbb → rgba() with the transparency alpha applied. */
  const withAlpha = (hex: string, alpha: number): string => {
    const m = hex.trim().match(/^#([0-9a-f]{6})$/i);
    if (!m) return hex;
    const n = parseInt(m[1], 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
  };

  // ── Resize handle (updates grid spans, not CSS dimensions) ──────────────

  const handleResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (!gridContainerRef?.current) return;
      // Read current spans from the wrapper div's grid-end styles
      const wrapper = containerRef.current?.parentElement;
      const spanCol = parseInt(wrapper?.getAttribute('data-span-col') || '1', 10);
      const spanRow = parseInt(wrapper?.getAttribute('data-span-row') || '1', 10);
      setResizeStart({ x: e.clientX, y: e.clientY, spanCol, spanRow });
      setCurrentSpan({ spanCol, spanRow });
    },
    [gridContainerRef, gridCols, gridRows],
  );

  useEffect(() => {
    if (!resizeStart) return;

    const handleMouseMove = (e: MouseEvent) => {
      const gridEl = gridContainerRef?.current;
      if (!gridEl) return;
      const rect = gridEl.getBoundingClientRect();
      const cellW = rect.width / Math.max(1, gridCols);
      const cellH = rect.height / Math.max(1, gridRows);
      const dx = e.clientX - resizeStart.x;
      const dy = e.clientY - resizeStart.y;
      const newSpanCol = Math.max(1, Math.round(resizeStart.spanCol + dx / cellW));
      const newSpanRow = Math.max(1, Math.round(resizeStart.spanRow + dy / cellH));
      setCurrentSpan({ spanCol: newSpanCol, spanRow: newSpanRow });
    };

    const handleMouseUp = () => {
      const finalSpan = currentSpan || { spanCol: resizeStart.spanCol, spanRow: resizeStart.spanRow };
      setResizeStart(null);
      setCurrentSpan(null);
      onResize?.(finalSpan.spanCol, finalSpan.spanRow);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [resizeStart, onResize, gridContainerRef, gridCols, gridRows, currentSpan]);

  // Convert 0-100 transparency to alpha: 0 → fully opaque, 100 → fully transparent.
  // Bases come from the active theme (not hardcoded dark values) so the panel
  // blends in midnight/ocean/carbon/seti instead of only dark.
  const bgAlpha = Math.max(0, 1 - transparency / 100);
  const bgColor = withAlpha(isActive ? theme.colors.bgTertiary : theme.colors.bg, bgAlpha);
  const borderColor = isActive ? theme.colors.accent : theme.colors.border;
  const headerBg = withAlpha(theme.colors.bgSecondary, bgAlpha);

  return (
    <div
      ref={containerRef}
      data-terminal-id={id}
      onMouseDown={onFocus}
      style={{
        display: 'flex',
        flexDirection: 'column',
        border: `1px solid ${borderColor}`,
        borderRadius: '8px',
        overflow: 'hidden',
        background: bgColor,
        cursor: 'default',
        transition: 'border-color 0.15s, box-shadow 0.15s, background 0.2s',
        boxShadow: isActive ? `0 0 0 1px ${theme.colors.accent}44, 0 4px 12px rgba(0,0,0,0.4)` : 'none',
        position: 'relative',
        minWidth: 0,
        minHeight: 0,
        width: '100%',
        height: '100%',
      }}
    >
      {/* Header */}
      <div
        draggable={!isMaximized && !!onDragStart}
        onDragStart={onDragStart}
        onMouseDown={onFocus}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '6px 10px',
          background: headerBg,
          borderBottom: `1px solid ${borderColor}`,
          cursor: isMaximized ? 'default' : (onDragStart ? 'grab' : 'pointer'),
          userSelect: 'none',
          flexShrink: '0',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
          <span
            style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              background: visible ? theme.colors.success : theme.colors.textMuted,
              flexShrink: 0,
            }}
          />
          <span
            style={{
              fontSize: '12px',
              color: theme.colors.text,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {title}
          </span>
        </div>
        <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
          <button
            onClick={(e) => { e.stopPropagation(); onMaximize(); }}
            title={isMaximized ? "Restore" : "Maximize"}
            style={btnStyle(theme.colors.accent)}
          >
            {isMaximized ? '❐' : '⛶'}
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onClose(); }}
            title="Close terminal"
            style={btnStyle(theme.colors.error)}
          >
            ✕
          </button>
        </div>
      </div>

      {/* Terminal content */}
      <div
        onMouseDown={onFocus}
        onClick={onFocus}
        style={{ flex: 1, overflow: 'hidden', position: 'relative', minHeight: 0 }}
      >
        <TerminalAnchor sessionId={id} isTui={isTui} />
      </div>

      {/* Resize handle (visual cue) */}
      {!isMaximized && (
        <div
          onMouseDown={handleResizeStart}
          style={{
            position: 'absolute',
            bottom: 0,
            right: 0,
            width: '12px',
            height: '12px',
            cursor: 'nwse-resize',
            background: `linear-gradient(135deg, transparent 50%, ${theme.colors.accent}55 50%)`,
            borderRadius: '0 0 7px 0',
            zIndex: 2,
          }}
        />
      )}
    </div>
  );
}

function btnStyle(color: string): React.CSSProperties {
  return {
    background: 'transparent',
    border: 'none',
    color,
    cursor: 'pointer',
    fontSize: '13px',
    padding: '2px 5px',
    borderRadius: '3px',
    lineHeight: 1,
    opacity: 0.7,
  };
}
