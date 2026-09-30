'use client';

import { useState, useCallback, useEffect } from 'react';
import { invoke } from '@/lib/tauri';
import { getDefaultShell } from '@/lib/shell';
import { forgetTerminalDims } from '@/lib/terminalDims';
import type { SessionMeta } from '@/lib/terminal';

export type { SessionMeta };

export function useTerminals() {
  const [sessions, setSessions] = useState<SessionMeta[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [defaultShell, setDefaultShell] = useState<string>(() => getDefaultShell());
  /** Last backend failure, surfaced to the UI instead of console-only. */
  const [error, setError] = useState<string | null>(null);

  const list = useCallback(async () => {
    try {
      const result = await invoke<SessionMeta[]>('terminal_list', undefined, []);
      setSessions(result);
      setError(null);
      return result;
    } catch (error) {
      console.error('Failed to list terminals:', error);
      setError(error instanceof Error ? error.message : String(error));
      return [];
    }
  }, []);

  /** Create a new terminal session */
  const create = useCallback(
    async (cwd?: string, workspaceId?: string, cols?: number, rows?: number) => {
      try {
        const id = await invoke<string>('terminal_create', {
          cwd: cwd || null,
          workspaceId: workspaceId || null,
          columns: cols,
          rows: rows,
        });
        await list();
        if (!activeId) {
          setActiveId(id);
        }
        return id;
      } catch (error) {
        console.error('Failed to create terminal:', error);
        setError(error instanceof Error ? error.message : String(error));
        throw error;
      }
    },
    [list, activeId],
  );

  const close = useCallback(async (id: string) => {
    try {
      await invoke('terminal_close', { id });
      forgetTerminalDims(id);
      await list();
      if (activeId === id) {
        setActiveId(null);
      }
    } catch (error) {
      console.error('Failed to close terminal:', error);
    }
  }, [list, activeId]);

  const resize = useCallback(async (id: string, cols: number, rows: number) => {
    try {
      await invoke('terminal_resize', { id, cols, rows });
    } catch (error) {
      console.error('Failed to resize terminal:', error);
    }
  }, []);

  const select = useCallback((id: string) => {
    setActiveId(id);
  }, []);

  const write = useCallback(async (id: string, data: string) => {
    try {
      await invoke('terminal_write', { id, data });
    } catch (error) {
      console.error('Failed to write to terminal:', error);
    }
  }, []);

  /** Send a command string + newline to a session's PTY stdin */
  const sendCommand = useCallback(async (id: string, command: string) => {
    try {
      await invoke('terminal_send_command', { id, command });
    } catch (error) {
      console.error('Failed to send command to terminal:', error);
    }
  }, []);

  const setShell = useCallback((shell: string) => {
    setDefaultShell(shell);
    try {
      localStorage.setItem('dwo-default-shell', shell);
    } catch {}
  }, []);

  // Load on mount
  useEffect(() => {
    list().catch(console.error);
    try {
      const saved = localStorage.getItem('dwo-default-shell');
      if (saved) {
        setDefaultShell(saved);
      }
    } catch {}
  }, [list]);

  return {
    sessions,
    activeId,
    error,
    clearError: () => setError(null),
    create,
    close,
    resize,
    select,
    write,
    sendCommand,
    list,
    defaultShell,
    setShell,
  };
}
