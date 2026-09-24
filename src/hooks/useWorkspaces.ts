'use client';

import { useState, useCallback, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';

export interface Workspace {
  id: string;
  name: string;
  path: string | null;
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
      const result = await invoke<Array<{ workspaces: Workspace[]; active_workspace_id: string | null }>>('list_workspaces');
      if (result.length > 0 && result[0].workspaces) {
        setWorkspaces(result[0].workspaces);
        // Restore the persisted active workspace, or default to first
        const savedId = result[0].active_workspace_id;
        if (savedId && result[0].workspaces.some(w => w.id === savedId)) {
          setActiveId(savedId);
        } else if (!activeId && result[0].workspaces.length > 0) {
          setActiveId(result[0].workspaces[0].id);
        }
      }
      return result;
    } catch (error) {
      console.error('Failed to load workspaces:', error);
      return [];
    }
  }, [activeId]);

  const create = useCallback(async (name: string, path?: string) => {
    try {
      const result = await invoke<Array<{ workspaces: Workspace[] }>>('create_workspace', {
        name,
        path: path || null,
      });
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

  /**
   * Opens the system folder picker dialog and returns the selected path.
   * Returns null if the user cancels.
   */
  const selectFolder = useCallback(async (): Promise<string | null> => {
    console.log('[useWorkspaces] selectFolder called, invoking select_workspace_folder...');
    try {
      const result = await invoke<string | null>('select_workspace_folder');
      console.log('[useWorkspaces] select_workspace_folder returned:', result);
      return result;
    } catch (error) {
      console.error('[useWorkspaces] Failed to open folder picker:', error);
      return null;
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

  const activate = useCallback(async (id: string) => {
    try {
      const result = await invoke<Array<{ workspaces: Workspace[]; active_workspace_id: string | null }>>('activate_workspace', { id });
      if (result.length > 0 && result[0].workspaces) {
        setWorkspaces(result[0].workspaces);
        if (result[0].active_workspace_id) {
          setActiveId(result[0].active_workspace_id);
        }
      }
    } catch (error) {
      console.error('Failed to activate workspace:', error);
    }
  }, []);

  // Load on mount
  useEffect(() => {
    load().catch(console.error);
  }, [load]);

  return {
    workspaces,
    activeId,
    setActiveId,
    create,
    selectFolder,
    close,
    rename,
    activate,
    load,
  };
}
