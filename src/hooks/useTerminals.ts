'use client';

import { useState, useCallback, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { getDefaultShell } from '@/lib/shell';

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
}

export function useTerminals() {
  const [sessions, setSessions] = useState<SessionMeta[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [defaultShell, setDefaultShell] = useState<string>(() => getDefaultShell());

  const list = useCallback(async () => {
    try {
      const result = await invoke<SessionMeta[]>('terminal_list');
      setSessions(result);
      return result;
    } catch (error) {
      console.error('Failed to list terminals:', error);
      return [];
    }
  }, []);

  const create = useCallback(async (cmd: string, cwd?: string, cols?: number, rows?: number) => {
    try {
      const id = await invoke<string>('terminal_create', {
        cmd,
        cwd,
        columns: cols,
        rows: rows
      });
      await list();
      if (!activeId) {
        setActiveId(id);
      }
      return id;
    } catch (error) {
      console.error('Failed to create terminal:', error);
      throw error;
    }
  }, [list, activeId]);

  const close = useCallback(async (id: string) => {
    try {
      await invoke('terminal_close', { id });
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

  const setShell = useCallback((shell: string) => {
    setDefaultShell(shell);
    // Persist to localStorage for persistence across sessions
    try {
      localStorage.setItem('dwo-default-shell', shell);
    } catch {}
  }, []);

  // Load on mount
  useEffect(() => {
    list().catch(console.error);
    // Restore saved shell preference
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
    create,
    close,
    resize,
    select,
    write,
    list,
    defaultShell,
    setShell,
  };
}
