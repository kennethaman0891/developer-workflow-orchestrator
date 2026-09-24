/**
 * DWO Tauri Bridge - Workspace Operations (Phase 2)
 */

import { invoke } from '@tauri-apps/api/core';

export interface Workspace {
  id: string;
  name: string;
  path: string | null;
  panes: string[];
  created_at: string;
  updated_at: string;
}

export async function wsCreate(name: string): Promise<Workspace> {
  const result = await invoke<Array<{ workspaces: Workspace[] }>>('create_workspace', { name });
  return result[0].workspaces[result[0].workspaces.length - 1];
}

export async function wsRename(id: string, newName: string): Promise<void> {
  await invoke('rename_workspace', { id, new_name: newName });
}

export async function wsClose(id: string): Promise<void> {
  await invoke('close_workspace', { id });
}

export async function wsLoad(): Promise<Workspace[]> {
  const result = await invoke<Array<{ workspaces: Workspace[] }>>('list_workspaces');
  return result[0]?.workspaces ?? [];
}

export async function wsSave(state: any): Promise<void> {
  await invoke('save_workspace_state', { state });
}

export async function wsList(): Promise<Workspace[]> {
  const result = await invoke<Array<{ workspaces: Workspace[] }>>('list_workspaces');
  return result[0]?.workspaces ?? [];
}
