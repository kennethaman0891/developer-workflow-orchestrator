'use client';

import { createContext, useContext, useMemo } from 'react';
import { useWorkspaces as useWorkspacesHook } from '@/hooks/useWorkspaces';
import type { Workspace } from '@/lib/workspace';

interface WorkspacesContextType {
  workspaces: Workspace[];
  activeId: string | null;
  create: (
    name: string,
    path?: string | null,
    template?: number | null,
    command?: string | null,
    color?: string | null,
  ) => Promise<Workspace>;
  update: (id: string, fields: { path?: string | null; command?: string | null; template?: number | null; color?: string | null }) => Promise<void>;
  activate: (id: string) => Promise<void>;
  close: (id: string) => Promise<void>;
  rename: (id: string, newName: string) => Promise<void>;
  load: () => Promise<Workspace[]>;
  selectFolder: () => Promise<string | null>;
  getLaunchCwd: () => Promise<string | null>;
}

const WorkspacesContext = createContext<WorkspacesContextType | null>(null);

export function WorkspacesProvider({ children }: { children: React.ReactNode }) {
  const hook = useWorkspacesHook();

  const value = useMemo<WorkspacesContextType>(() => ({
    workspaces: hook.workspaces,
    activeId: hook.activeId,
    create: hook.create,
    update: hook.update,
    activate: hook.activate,
    close: hook.close,
    rename: hook.rename,
    load: hook.load,
    selectFolder: hook.selectFolder,
    getLaunchCwd: hook.getLaunchCwd,
  }), [hook]);

  return (
    <WorkspacesContext.Provider value={value}>
      {children}
    </WorkspacesContext.Provider>
  );
}

export function useWorkspaces(): WorkspacesContextType {
  const ctx = useContext(WorkspacesContext);
  if (!ctx) throw new Error('useWorkspaces must be used within WorkspacesProvider');
  return ctx;
}
