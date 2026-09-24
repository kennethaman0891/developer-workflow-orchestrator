'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { listFiles, readFile, writeFile, type FsEntry } from '@/lib/api';

export interface OpenFile {
  path: string;
  content: string;
  dirty: boolean;
  modTime?: string;
}

export interface UseOpenFilesReturn {
  openFiles: Map<string, OpenFile>;
  activeFilePath: string | null;
  addFile: (path: string) => Promise<void>;
  closeFile: (path: string) => void;
  saveFile: (path: string, content: string) => Promise<void>;
  markDirty: (path: string) => void;
  setActiveFilePath: (path: string | null) => void;
}

export function useOpenFiles(): UseOpenFilesReturn {
  const [openFiles, setOpenFiles] = useState<Map<string, OpenFile>>(new Map());
  const [activeFilePath, setActiveFilePath] = useState<string | null>(null);
  const saveTimeoutRef = useRef<Record<string, NodeJS.Timeout>>({});

  /** Add a file to the open files map */
  const addFile = useCallback(async (path: string) => {
    // Check if already open
    if (openFiles.has(path)) {
      setActiveFilePath(path);
      return;
    }

    try {
      const content = await readFile(path);
      const newFile: OpenFile = { path, content, dirty: false };
      setOpenFiles(prev => {
        const next = new Map(prev);
        next.set(path, newFile);
        return next;
      });
      setActiveFilePath(path);
    } catch (error) {
      console.error(`Failed to open file ${path}:`, error);
    }
  }, [openFiles]);

  /** Close a file tab */
  const closeFile = useCallback((path: string) => {
    setOpenFiles(prev => {
      const next = new Map(prev);
      next.delete(path);
      return next;
    });
    if (activeFilePath === path) {
      // Activate another file or clear
      const remaining = Array.from(openFiles.keys()).filter(p => p !== path);
      setActiveFilePath(remaining[remaining.length - 1] || null);
    }
  }, [activeFilePath, openFiles]);

  /** Save file content to disk */
  const saveFile = useCallback(async (path: string, content: string) => {
    try {
      await writeFile(path, content);
      setOpenFiles(prev => {
        const file = prev.get(path);
        if (file) {
          const next = new Map(prev);
          next.set(path, { ...file, content, dirty: false });
          return next;
        }
        return prev;
      });
    } catch (error) {
      console.error(`Failed to save ${path}:`, error);
    }
  }, []);

  /** Mark a file as dirty (unsaved changes) */
  const markDirty = useCallback((path: string) => {
    setOpenFiles(prev => {
      const file = prev.get(path);
      if (file) {
        const next = new Map(prev);
        next.set(path, { ...file, dirty: true });
        return next;
      }
      return prev;
    });
  }, []);

  return {
    openFiles,
    activeFilePath,
    addFile,
    closeFile,
    saveFile,
    markDirty,
    setActiveFilePath,
  };
}
