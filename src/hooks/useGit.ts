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

/** Empty status returned when there is no workspace path / outside Tauri. */
const EMPTY_STATUS: GitStatus = { branch: '', modified: [], staged: [], untracked: [] };

/**
 * Shell result used as a web-mode fallback for mutating commands so callers
 * get a resolved value instead of a rejection when not inside Tauri.
 */
const UNAVAILABLE: GitResult = {
  success: false,
  message: 'Git is only available inside the DWO desktop app.',
};

/**
 * Git hook bound to a workspace path.
 *
 * Every Tauri command requires `projectPath` — without it the Rust side
 * rejects with "missing required key projectPath". Pass the active workspace
 * folder here; when it is falsy the hook stays inert (status `null`, all
 * callbacks resolve immediately) and nothing is invoked.
 */
export function useGit(projectPath?: string) {
  const [status, setStatus] = useState<GitStatus | null>(null);
  const [loading, setLoading] = useState(false);

  const getStatus = useCallback(async (): Promise<GitStatus | null> => {
    if (!projectPath) {
      setStatus(null);
      return null;
    }
    setLoading(true);
    try {
      const result = await invoke<GitStatus>('git_status', { projectPath }, EMPTY_STATUS);
      setStatus(result);
      return result;
    } catch (error) {
      console.error('Failed to get git status:', error);
      return null;
    } finally {
      setLoading(false);
    }
  }, [projectPath]);

  const stageFile = useCallback(async (file: string): Promise<GitResult | null> => {
    if (!projectPath) return null;
    try {
      const result = await invoke<GitResult>('git_stage', { projectPath, file }, UNAVAILABLE);
      await getStatus();
      return result;
    } catch (error) {
      console.error('Failed to stage file:', error);
      return null;
    }
  }, [projectPath, getStatus]);

  const unstageFile = useCallback(async (file: string): Promise<GitResult | null> => {
    if (!projectPath) return null;
    try {
      const result = await invoke<GitResult>('git_unstage', { projectPath, file }, UNAVAILABLE);
      await getStatus();
      return result;
    } catch (error) {
      console.error('Failed to unstage file:', error);
      return null;
    }
  }, [projectPath, getStatus]);

  const commit = useCallback(async (message: string): Promise<GitResult | null> => {
    if (!projectPath) return null;
    try {
      const result = await invoke<GitResult>('git_commit', { projectPath, message }, UNAVAILABLE);
      await getStatus();
      return result;
    } catch (error) {
      console.error('Failed to commit:', error);
      return null;
    }
  }, [projectPath, getStatus]);

  const getLog = useCallback(async (limit: number = 10): Promise<string[]> => {
    if (!projectPath) return [];
    try {
      return await invoke<string[]>('git_log', { projectPath, limit }, []);
    } catch (error) {
      console.error('Failed to get git log:', error);
      return [];
    }
  }, [projectPath]);

  const getBranch = useCallback(async (): Promise<string> => {
    if (!projectPath) return '';
    try {
      return await invoke<string>('git_branch', { projectPath }, '');
    } catch (error) {
      console.error('Failed to get git branch:', error);
      return 'main';
    }
  }, [projectPath]);

  // Load on mount / whenever the workspace path changes.
  // Without a path the status simply stays null — no request, no error log.
  useEffect(() => {
    if (!projectPath) {
      setStatus(null);
      return;
    }
    getStatus().catch(console.error);
  }, [projectPath, getStatus]);

  return {
    status,
    loading,
    getStatus,
    stageFile,
    unstageFile,
    commit,
    getLog,
    getBranch,
  };
}
