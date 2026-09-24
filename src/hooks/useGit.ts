'use client';

import { useState, useCallback, useEffect } from 'react';
import { invoke } from '@/lib/tauri';

export interface GitStatus {
  branch: string;
  modified: string[];
  staged: string[];
  untracked: string[];
}

export interface GitResult {
  success: boolean;
  message: string;
  output?: string;
}

export function useGit() {
  const [status, setStatus] = useState<GitStatus | null>(null);
  const [loading, setLoading] = useState(false);

  const getStatus = useCallback(async () => {
    setLoading(true);
    try {
      const result = await invoke<GitStatus>('git_status', undefined, { branch: '', modified: [], staged: [], untracked: [] });
      setStatus(result);
      return result;
    } catch (error) {
      console.error('Failed to get git status:', error);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const stageFile = useCallback(async (file: string): Promise<GitResult | null> => {
    try {
      const result = await invoke<GitResult>('git_stage', { file });
      await getStatus();
      return result;
    } catch (error) {
      console.error('Failed to stage file:', error);
      return null;
    }
  }, [getStatus]);

  const commit = useCallback(async (message: string): Promise<GitResult | null> => {
    try {
      const result = await invoke<GitResult>('git_commit', { message });
      await getStatus();
      return result;
    } catch (error) {
      console.error('Failed to commit:', error);
      return null;
    }
  }, [getStatus]);

  const getLog = useCallback(async (limit: number = 10): Promise<string[]> => {
    try {
      return await invoke<string[]>('git_log', { limit });
    } catch (error) {
      console.error('Failed to get git log:', error);
      return [];
    }
  }, []);

  const getBranch = useCallback(async (): Promise<string> => {
    try {
      return await invoke<string>('git_branch');
    } catch (error) {
      console.error('Failed to get git branch:', error);
      return 'main';
    }
  }, []);

  // Load on mount
  useEffect(() => {
    getStatus().catch(console.error);
  }, [getStatus]);

  return {
    status,
    loading,
    getStatus,
    stageFile,
    commit,
    getLog,
    getBranch,
  };
}
