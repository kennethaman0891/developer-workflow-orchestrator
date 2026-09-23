'use client';

import { useEffect } from 'react';
import { useTerminals } from '@/hooks/useTerminals';
import { TerminalLayout } from './TerminalLayout';

interface TerminalPoolProps {
  view?: 'workspace' | 'grid';
  /** Per-workspace layout key (isolates Open Code vs Cloud Code layouts) */
  layoutKey?: string;
}

export function TerminalPool({ view: _view = 'grid', layoutKey }: TerminalPoolProps) {
  const { sessions, create, close, defaultShell } = useTerminals();

  // Auto-create a terminal on mount if none exist
  useEffect(() => {
    if (sessions.length === 0) {
      create(defaultShell).catch(console.error);
    }
  }, [sessions.length, create, defaultShell]);

  return (
    <TerminalLayout
      sessions={sessions}
      defaultShell={defaultShell}
      layoutKey={layoutKey}
      onCreate={() => create(defaultShell)}
      onCloseSession={(id) => close(id)}
    />
  );
}
