/**
 * DWO Tauri Bridge - Workspace Operations
 */

import { invoke } from '@/lib/tauri';

export interface PaneSlot {
  tty: string | null;
}

export interface Workspace {
  id: string;
  name: string;
  path: string | null;
  template: number | null;
  color: string | null;
  command: string | null;
  panes: PaneSlot[];
  created_at: string;
  updated_at: string;
}

/** Available terminal grid templates — how many panes */
export type WorkspaceTemplate = 1 | 2 | 4 | 6 | 8 | 10 | 12 | 14 | 16;

/** Preset workspace accent colors */
export const WORKSPACE_COLORS = [
  '#4a9eff', // blue
  '#34d399', // green
  '#f472b6', // pink
  '#fbbf24', // amber
  '#a78bfa', // purple
  '#f87171', // red
  '#38bdf8', // sky
  '#fb923c', // orange
] as const;

/** Create a new workspace with full fields */
export async function newWorkspace(
  name: string,
  path?: string | null,
  template?: WorkspaceTemplate | null,
  command?: string | null,
  color?: string | null,
): Promise<Workspace> {
  const result = await invoke<Workspace[]>('create_workspace', {
    name,
    path: path || null,
    template: template ?? null,
    command: command || null,
    color: color || null,
  });
  return result[result.length - 1];
}

/** Update a workspace's fields */
export async function updateWorkspace(
  id: string,
  fields: {
    path?: string | null;
    command?: string | null;
    template?: number | null;
    color?: string | null;
  },
): Promise<Workspace[]> {
  return invoke<Workspace[]>('update_workspace', {
    id,
    path: fields.path !== undefined ? fields.path : null,
    command: fields.command !== undefined ? fields.command : null,
    template: fields.template !== undefined ? fields.template : null,
    color: fields.color !== undefined ? fields.color : null,
  });
}

export async function wsRename(id: string, newName: string): Promise<void> {
  await invoke('rename_workspace', { id, newName: newName });
}

export async function wsClose(id: string): Promise<void> {
  await invoke('close_workspace', { id });
}

export async function wsLoad(): Promise<Workspace[]> {
  return invoke<Workspace[]>('list_workspaces');
}

export async function wsSave(state: any): Promise<void> {
  await invoke('save_workspace_state', { newState: state });
}

export async function wsList(): Promise<Workspace[]> {
  return invoke<Workspace[]>('list_workspaces');
}

/** Get the launch working directory written by the CLI wrapper */
export async function getLaunchCwd(): Promise<string | null> {
  return invoke<string | null>('get_launch_cwd');
}

/** Open the system folder picker dialog */
export async function selectFolder(): Promise<string | null> {
  return invoke<string | null>('select_workspace_folder');
}
