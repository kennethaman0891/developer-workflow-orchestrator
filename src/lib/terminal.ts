/**
 * DWO Tauri Bridge - Terminal Operations
 * Wraps Tauri invoke calls for terminal management
 */

import { invoke } from '@/lib/tauri';

export interface SessionMeta {
  id: string;
  title: string;
  cwd: string;
  columns: number;
  rows: number;
  created_at: string;
  last_activity: string;
  focus: boolean;
  visible: boolean;
  is_tui: boolean;
  workspace_id: string | null;
}

export interface TerminalCreateOptions {
  /** Project directory to open in (validated, falls back to HOME) */
  cwd?: string;
  /** Workspace this terminal belongs to */
  workspaceId?: string;
  /** Initial terminal columns (default 80) */
  columns?: number;
  /** Initial terminal rows (default 24) */
  rows?: number;
}

/** Create a new terminal session */
export async function terminalCreate(options: TerminalCreateOptions): Promise<string> {
  return invoke<string>('terminal_create', {
    cwd: options.cwd,
    workspaceId: options.workspaceId,
    columns: options.columns,
    rows: options.rows,
  });
}

export async function terminalAttach(id: string): Promise<void> {
  await invoke('terminal_attach', { id });
}

export async function terminalDetach(id: string): Promise<void> {
  await invoke('terminal_detach', { id });
}

export async function terminalWrite(id: string, data: string): Promise<void> {
  await invoke('terminal_write', { id, data });
}

/** Send a command string + newline to a session's PTY stdin */
export async function terminalSendCommand(id: string, command: string): Promise<void> {
  await invoke('terminal_send_command', { id, command });
}

export async function terminalResize(id: string, cols: number, rows: number): Promise<void> {
  await invoke('terminal_resize', { id, cols, rows });
}

export async function terminalClose(id: string): Promise<void> {
  await invoke('terminal_close', { id });
}

export async function terminalList(): Promise<SessionMeta[]> {
  return invoke<SessionMeta[]>('terminal_list');
}

export async function terminalGetScrollback(id: string): Promise<string[]> {
  return invoke<string[]>('terminal_get_scrollback', { id });
}

export async function terminalSetTitle(id: string, title: string): Promise<void> {
  await invoke('terminal_set_title', { id, title });
}

export async function terminalSetTui(id: string, isTui: boolean): Promise<void> {
  await invoke('terminal_set_tui', { id, isTui });
}

export async function terminalSetFocus(id: string, focused: boolean): Promise<void> {
  await invoke('terminal_set_focus', { id, focused });
}

export async function terminalSetVisible(id: string, visible: boolean): Promise<void> {
  await invoke('terminal_set_visible', { id, visible });
}

export async function terminalDropFiles(id: string, files: string[]): Promise<void> {
  await invoke('terminal_drop_files', { id, files });
}

// ── Session Handoff ──────────────────────────────────────────────────────────

export interface SessionSummary {
  id: string;
  source_session_id: string;
  title: string;
  created_at: string;
  cwd: string;
  line_count: number;
}

export interface HandoffArtifact {
  id: string;
  source_session_id: string;
  title: string;
  created_at: string;
  cwd: string;
  columns: number;
  rows: number;
  scrollback: string[];
  notes: string | null;
  line_count: number;
}

export async function handoffCapture(
  sourceId: string,
  title?: string,
  notes?: string,
): Promise<SessionSummary> {
  return invoke<SessionSummary>('handoff_capture', { sourceId, title: title ?? null, notes: notes ?? null });
}

export async function handoffList(): Promise<SessionSummary[]> {
  return invoke<SessionSummary[]>('handoff_list');
}

export async function handoffGet(id: string): Promise<HandoffArtifact | null> {
  return invoke<HandoffArtifact | null>('handoff_get', { id });
}

export async function handoffInject(targetId: string, artifactId: string): Promise<void> {
  await invoke('handoff_inject', { targetId, artifactId });
}

export async function handoffDelete(id: string): Promise<void> {
  await invoke('handoff_delete', { id });
}
