'use client';

import { useState, useCallback } from 'react';
import { readFile, writeFile } from '@/lib/api';

export interface OpenFile {
  path: string;
  content: string;
  dirty: boolean;
  modTime?: string;
}

export interface UseOpenFilesReturn {
  openFiles: Map<string, OpenFile>;
  activeFilePath: string | null;
  /** Last open/save failure, for UI banners (null when healthy). */
  fileError: string | null;
  clearFileError: () => void;
  addFile: (path: string) => Promise<void>;
  closeFile: (path: string) => void;
  saveFile: (path: string, content: string) => Promise<void>;
  markDirty: (path: string) => void;
  /**
   * Record an edit from the editor: stores the new buffer *and* flags the file
   * as dirty. Both are required — storing content alone would silently drop
   * edits on close, and flagging dirty alone would save a stale buffer.
   */
  updateContent: (path: string, content: string) => void;
  setActiveFilePath: (path: string | null) => void;
}

export function useOpenFiles(): UseOpenFilesReturn {
  const [openFiles, setOpenFiles] = useState<Map<string, OpenFile>>(new Map());
  const [activeFilePath, setActiveFilePath] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  /** Add a file to the open files map */
  const addFile = useCallback(
    async (path: string) => {
      // Check if already open
      if (openFiles.has(path)) {
        setActiveFilePath(path);
        return;
      }

      try {
        const content = await readFile(path);
        const newFile: OpenFile = { path, content, dirty: false };
        setOpenFiles((prev) => {
          const next = new Map(prev);
          next.set(path, newFile);
          return next;
        });
        setActiveFilePath(path);
        setFileError(null);
      } catch (error) {
        console.error(`Failed to open file ${path}:`, error);
        setFileError(
          `Could not open ${path.split('/').pop() || path}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    },
    [openFiles],
  );

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
      setOpenFiles((prev) => {
        const file = prev.get(path);
        if (file) {
          const next = new Map(prev);
          next.set(path, { ...file, content, dirty: false });
          return next;
        }
        return prev;
      });
      setFileError(null);
    } catch (error) {
      console.error(`Failed to save ${path}:`, error);
      // Keep dirty=true (untouched above) AND surface the failure — the old
      // code swallowed it, so users closed tabs believing edits were saved.
      setFileError(
        `Could not save ${path.split('/').pop() || path}: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
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

  /** Record an edit: update the buffer and mark the file dirty in one write. */
  const updateContent = useCallback((path: string, content: string) => {
    setOpenFiles(prev => {
      const file = prev.get(path);
      if (!file || file.content === content) {
        // Unknown file, or an echo of what we already hold — skip the re-render.
        return prev;
      }
      const next = new Map(prev);
      next.set(path, { ...file, content, dirty: true });
      return next;
    });
  }, []);

  return {
    openFiles,
    activeFilePath,
    fileError,
    clearFileError: () => setFileError(null),
    addFile,
    closeFile,
    saveFile,
    markDirty,
    updateContent,
    setActiveFilePath,
  };
}
