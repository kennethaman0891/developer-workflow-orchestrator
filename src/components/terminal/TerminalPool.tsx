'use client';

import type { SessionMeta } from '@/lib/terminal';
import { TerminalLayout } from './TerminalLayout';

interface TerminalPoolProps {
  view?: 'workspace' | 'grid';
  /** Per-workspace localStorage key so Open Code / Cloud Code keep separate layouts */
  layoutKey?: string;
  /** The authoritative session list — lifted from page.tsx's useTerminals() */
  sessions: SessionMeta[];
  /** Callback to create a new terminal — wired from the parent (page.tsx) */
  onCreateTerminal?: () => void;
  /** Called to close a terminal session */
  onCloseSession?: (id: string) => void;
  /** CLI command to auto-launch in every pane (from workspace.command) */
  autoLaunchCommand?: string | null;
  /** Whether auto-exec permission is enabled */
  autoLaunchEnabled?: boolean;
}

/**
 * TerminalPool — renders the terminal layout from the sessions owned by the
 * parent (page.tsx). It must NOT create its own useTerminals() instance,
 * otherwise it holds a stale copy of the session list and new terminals
 * never appear.
 */
export function TerminalPool({
  view: _view = 'grid',
  layoutKey,
  sessions,
  onCreateTerminal,
  onCloseSession,
  autoLaunchCommand,
  autoLaunchEnabled,
}: TerminalPoolProps) {
  return (
    <TerminalLayout
      sessions={sessions}
      layoutKey={layoutKey}
      onCreate={() => onCreateTerminal?.()}
      onCloseSession={(id) => onCloseSession?.(id)}
      autoLaunchCommand={autoLaunchCommand}
      autoLaunchEnabled={autoLaunchEnabled}
    />
  );
}