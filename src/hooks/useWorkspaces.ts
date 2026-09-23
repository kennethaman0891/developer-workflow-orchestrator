'use client';

import { useState, useCallback, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';

export interface Workspace {
  id: string;
  name: string;
  panes: string[];
  created_at: string;
  updated_at: string;
}

export function useWorkspaces() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      // list_workspaces returns Vec<AppState>, extract workspaces
      const result = await invoke<Array<{ workspaces: Workspace[] }>>('list_workspaces');
      if (result.length > 0 && result[0].workspaces) {
        setWorkspaces(result[0].workspaces);
        if (!activeId && result[0].workspaces.length > 0) {
          setActiveId(result[0].workspaces[0].id);
        }
      }
      return result;
    } catch (error) {
      console.error('Failed to load workspaces:', error);
      return [];
    }
  }, [activeId]);

  const create = useCallback(async (name: string) => {
    try {
      const result = await invoke<Array<{ workspaces: Workspace[] }>>('create_workspace', { name });
      if (result.length > 0 && result[0].workspaces.length > 0) {
        const newWs = result[0].workspaces[result[0].workspaces.length - 1];
        setWorkspaces(result[0].workspaces);
        setActiveId(newWs.id);
        return newWs;
      }
      throw new Error('Failed to create workspace');
    } catch (error) {
      console.error('Failed to create workspace:', error);
      throw error;
    }
  }, []);

  const close = useCallback(async (id: string) => {
    try {
      await invoke('close_workspace', { id });
      await load();
    } catch (error) {
      console.error('Failed to close workspace:', error);
    }
  }, [load]);

  const rename = useCallback(async (id: string, newName: string) => {
    try {
      await invoke('rename_workspace', { id, new_name: newName });
      await load();
    } catch (error) {
      console.error('Failed to rename workspace:', error);
    }
  }, [load]);

  // Load on mount
  useEffect(() => {
    load().catch(console.error);
  }, [load]);

  return {
    workspaces,
    activeId,
    setActiveId,
    create,
    close,
    rename,
    load,
  };
}
