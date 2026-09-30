'use client';

import { useState, useCallback, useEffect } from 'react';
import { invoke } from '@/lib/tauri';

export interface FsEntry {
  name: string;
  path: string;
  is_dir: boolean;
  size: number | null;
  mtime: string | null;
}

export function useFileSystem() {
  const [currentPath, setCurrentPath] = useState<string>('');
  const [entries, setEntries] = useState<FsEntry[]>([]);
  const [loading, setLoading] = useState(false);

  const list = useCallback(async (path: string) => {
    setLoading(true);
    try {
      const result = await invoke<FsEntry[]>('list_dir', { path }, []);
      setEntries(result);
      setCurrentPath(path);
      return result;
    } catch (error) {
      console.error('Failed to list directory:', error);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  const read = useCallback(async (path: string): Promise<string> => {
    return invoke<string>('read_file', { path });
  }, []);

  const write = useCallback(async (path: string, content: string): Promise<void> => {
    await invoke('write_file', { path, content });
  }, []);

  const createFile = useCallback(async (path: string): Promise<void> => {
    await invoke('create_file', { path });
  }, []);

  const createDir = useCallback(async (path: string): Promise<void> => {
    await invoke('create_dir', { path });
  }, []);

  const rename = useCallback(async (oldPath: string, newPath: string): Promise<void> => {
    await invoke('rename', { old_path: oldPath, new_path: newPath });
  }, []);

  const deleteEntry = useCallback(async (path: string): Promise<void> => {
    await invoke('delete', { path });
  }, []);

  const search = useCallback(async (pattern: string, path?: string): Promise<string[]> => {
    return invoke<string[]>('search', { pattern, path }, []);
  }, []);

  // NOTE: the old code called require('os').homedir() here — `require` does
  // not exist in the browser/static-export bundle and threw ReferenceError,
  // leaving any FileTree mount permanently blank. Home resolution now goes
  // through the backend (get_home) with a static fallback.
  useEffect(() => {
    invoke<string | null>('get_home', undefined, null)
      .then((home) => {
        list(home || '/').catch(console.error);
      })
      .catch(() => {
        list('/').catch(console.error);
      });
  }, [list]);

  return {
    entries,
    currentPath,
    loading,
    list,
    read,
    write,
    createFile,
    createDir,
    rename,
    delete: deleteEntry,
    search,
    setCurrentPath,
  };
}
