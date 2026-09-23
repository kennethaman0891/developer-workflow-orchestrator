'use client';

/**
 * WorkspaceView — Dedicated CLI workspace container.
 *
 * Wraps a TerminalPool inside a named workspace frame so each CLI environment
 * (e.g. "Open Code", "Cloud Code") has its own identity, status, and layout
 * persistence. Layouts are namespaced per workspace via `layoutKey` so switching
 * between Open Code and Cloud Code preserves each one's terminal arrangement.
 */

import { useMemo } from 'react';
import { TerminalPool } from '@/components/terminal/TerminalPool';
import { useTheme } from '@/contexts/ThemeContext';

export interface WorkspaceViewProps {
  /** Workspace display name (e.g. "Open Code", "Cloud Code") */
  name: string;
  /** Short descriptor shown under the name */
  subtitle?: string;
  /** Per-workspace layout storage key (e.g. "dwo-terminal-layout-open-code") */
  layoutKey: string;
  /** Accent color for the workspace identity dot / highlight */
  accent?: string;
}

const statusDot = (color: string) => ({
  width: 8,
  height: 8,
  borderRadius: '50%',
  background: color,
  boxShadow: `0 0 8px ${color}`,
  flexShrink: 0,
} as const);

export function WorkspaceView({
  name,
  subtitle,
  layoutKey,
  accent = '#4a9eff',
}: WorkspaceViewProps) {
  const { theme } = useTheme();

  const headerStyle = useMemo(
    () => ({
      display: 'flex',
      alignItems: 'center',
      gap: theme.spacing.md,
      padding: `0 ${theme.spacing.lg}`,
      height: 44,
      background: theme.colors.bgSecondary,
      borderBottom: `1px solid ${theme.colors.border}`,
    }),
    [theme],
  );

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: theme.colors.bg,
        color: theme.colors.text,
      }}
    >
      {/* ── Workspace header ───────────────────────────────────────────── */}
      <header style={headerStyle}>
        <span title="active" style={statusDot(accent)} />
        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <span
            style={{
              fontSize: 13,
              fontWeight: 600,
              lineHeight: 1.2,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {name}
          </span>
          {subtitle && (
            <span
              style={{
                fontSize: 11,
                color: theme.colors.textMuted,
                lineHeight: 1.2,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {subtitle}
            </span>
          )}
        </div>
        <span
          style={{
            marginLeft: 'auto',
            fontSize: 11,
            color: theme.colors.textMuted,
            fontFamily: theme.fonts.monospace,
            display: 'flex',
            alignItems: 'center',
            gap: theme.spacing.sm,
          }}
        >
          <span>local</span>
        </span>
      </header>

      {/* ── Terminal pool ──────────────────────────────────────────────── */}
      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
        <TerminalPool layoutKey={layoutKey} />
      </div>
    </div>
  );
}