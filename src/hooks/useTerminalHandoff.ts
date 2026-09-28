'use client';

import { useState, useCallback, useEffect } from 'react';
import { invoke } from '@/lib/tauri';
import type { SessionSummary, HandoffArtifact } from '@/lib/terminal';

export type { SessionSummary, HandoffArtifact };

export function useTerminalHandoff() {
  const [artifacts, setArtifacts] = useState<SessionSummary[]>([]);
  const [selected, setSelected] = useState<HandoffArtifact | null>(null);

  const list = useCallback(async () => {
    try {
      const result = await invoke<SessionSummary[]>('handoff_list');
      setArtifacts(result);
      return result;
    } catch (error) {
      console.error('Failed to list handoff artifacts:', error);
      return [];
    }
  }, []);

  const capture = useCallback(async (
    sourceId: string,
    title?: string,
    notes?: string,
  ): Promise<SessionSummary | null> => {
    try {
      const result = await invoke<SessionSummary>('handoff_capture', {
        sourceId,
        title: title || null,
        notes: notes || null,
      });
      setArtifacts(prev => [...prev, result]);
      return result;
    } catch (error) {
      console.error('Failed to capture handoff:', error);
      return null;
    }
  }, []);

  const getArtifact = useCallback(async (id: string): Promise<HandoffArtifact | null> => {
    try {
      const result = await invoke<HandoffArtifact | null>('handoff_get', { id });
      if (result) setSelected(result);
      return result;
    } catch (error) {
      console.error('Failed to get artifact:', error);
      return null;
    }
  }, []);

  const inject = useCallback(async (targetId: string, artifactId: string): Promise<boolean> => {
    try {
      await invoke('handoff_inject', { targetId, artifactId });
      return true;
    } catch (error) {
      console.error('Failed to inject handoff:', error);
      return false;
    }
  }, []);

  const remove = useCallback(async (id: string): Promise<void> => {
    try {
      await invoke('handoff_delete', { id });
      setArtifacts(prev => prev.filter(a => a.id !== id));
      if (selected?.id === id) setSelected(null);
    } catch (error) {
      console.error('Failed to delete handoff:', error);
    }
  }, [selected]);

  // Load on mount
  useEffect(() => {
    list().catch(console.error);
  }, [list]);

  return {
    artifacts,
    selected,
    capture,
    getArtifact,
    inject,
    remove,
    list,
    setSelected,
  };
}
