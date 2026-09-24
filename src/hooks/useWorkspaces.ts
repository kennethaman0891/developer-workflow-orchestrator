'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { type Workspace } from '@/lib/workspace';

export function useWorkspaces() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const mountedRef = useRef(false);

  /** Load workspaces from Rust state. Stable identity — does NOT depend on activeId. */
  const load = useCallback(async (): Promise<Workspace[]> => {
    try {
      const result = await invoke<Workspace[]>('list_workspaces');
      setWorkspaces(result);
      const state = await invoke<{ active_workspace_id: string | null }>('get_workspace_state');
      if (state.active_workspace_id && result.some(w => w.id === state.active_workspace_id)) {
        setActiveId((prev) => prev ?? state.active_workspace_id);
      } else if (result.length > 0) {
        setActiveId((prev) => prev ?? result[0].id);
      }
      return result;
    } catch (error) {
      console.error('Failed to load workspaces:', error);
      return [];
    }
  }, []);

  /** Create a new workspace with full fields */
  const create = useCallback(async (
    name: string,
    path?: string | null,
    template?: number | null,
    command?: string | null,
    color?: string | null,
  ): Promise<Workspace> => {
    try {
      const result = await invoke<Workspace[]>('create_workspace', {
        name,
        path: path || null,
        template: template ?? null,
        command: command || null,
        color: color || null,
      });
      if (result.length > 0) {
        const newWs = result[result.length - 1];
        setWorkspaces(result);
        setActiveId(newWs.id);
        return newWs;
      }
      throw new Error('Failed to create workspace');
    } catch (error) {
      console.error('Failed to create workspace:', error);
      throw error;
    }
  }, []);

  /** Update a workspace's fields */
  const update = useCallback(async (
    id: string,
    fields: { path?: string | null; command?: string | null; template?: number | null; color?: string | null },
  ): Promise<void> => {
    try {
      const result = await invoke<Workspace[]>('update_workspace', {
        id,
        path: fields.path !== undefined ? fields.path : null,
        command: fields.command !== undefined ? fields.command : null,
        template: fields.template !== undefined ? fields.template : null,
        color: fields.color !== undefined ? fields.color : null,
      });
      setWorkspaces(result);
    } catch (error) {
      console.error('Failed to update workspace:', error);
    }
  }, []);

  /** Opens the system folder picker dialog and returns the selected path */
  const selectFolder = useCallback(async (): Promise<string | null> => {
    try {
      const result = await invoke<string | null>('select_workspace_folder');
      return result;
    } catch (error) {
      console.error('[useWorkspaces] Failed to open folder picker:', error);
      return null;
    }
  }, []);

  /** Get the launch working directory from the CLI wrapper */
  const getLaunchCwd = useCallback(async (): Promise<string | null> => {
    try {
      return await invoke<string | null>('get_launch_cwd');
    } catch (error) {
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
      await invoke('rename_workspace', { id, newName: newName });
      await load();
    } catch (error) {
      console.error('Failed to rename workspace:', error);
    }
  }, [load]);

  const activate = useCallback(async (id: string) => {
    try {
      await invoke('activate_workspace', { id });
      setActiveId(id);
      await load();
    } catch (error) {
      console.error('Failed to activate workspace:', error);
    }
  }, [load]);

  // Load once on mount only — never re-run on activeId change
  useEffect(() => {
    if (mountedRef.current) return;
    mountedRef.current = true;
    load().catch(console.error);
  }, [load]);

  return {
    workspaces,
    activeId,
    setActiveId,
    create,
    update,
    selectFolder,
    getLaunchCwd,
    close,
    rename,
    activate,
    load,
  };
}