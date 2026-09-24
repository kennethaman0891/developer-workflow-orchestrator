'use client';

import { useTerminals } from '@/hooks/useTerminals';
import { TerminalLayout } from './TerminalLayout';

interface TerminalPoolProps {
  view?: 'workspace' | 'grid';
  /** Per-workspace localStorage key so Open Code / Cloud Code keep separate layouts */
  layoutKey?: string;
  /** Callback to create a new terminal — wired from the parent (page.tsx) */
  onCreateTerminal?: () => void;
}

export function TerminalPool({ view: _view = 'grid', layoutKey, onCreateTerminal }: TerminalPoolProps) {
  const { sessions, close } = useTerminals();

  return (
    <TerminalLayout
      sessions={sessions}
      layoutKey={layoutKey}
      onCreate={() => onCreateTerminal?.()}
      onCloseSession={(id) => close(id)}
    />
  );
}
