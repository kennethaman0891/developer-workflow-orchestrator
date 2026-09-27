/**
 * DWO Tauri Bridge - File System Operations (Phase 2)
 */

import { invoke } from '@/lib/tauri';

export interface FsEntry {
  name: string;
  path: string;
  is_dir: boolean;
  size: number | null;
  mtime: string | null;
}

export async function fsListDir(path: string): Promise<FsEntry[]> {
  return invoke<FsEntry[]>('list_dir', { path });
}

export async function fsReadFile(path: string): Promise<string> {
  return invoke<string>('read_file', { path });
}

export async function fsWriteFile(path: string, content: string): Promise<void> {
  await invoke('write_file', { path, content });
}

export async function fsCreateFile(path: string): Promise<void> {
  await invoke('create_file', { path });
}

export async function fsCreateDir(path: string): Promise<void> {
  await invoke('create_dir', { path });
}

export async function fsRename(oldPath: string, newPath: string): Promise<void> {
  await invoke('rename', { old_path: oldPath, new_path: newPath });
}

export async function fsDelete(path: string): Promise<void> {
  await invoke('delete', { path });
}

/**
 * Search file contents (legacy shape): paths of files containing `pattern`.
 * Use `searchContent` in `lib/api.ts` for structured results.
 */
export async function fsSearch(pattern: string, path?: string): Promise<string[]> {
  return invoke<string[]>('search', { pattern, path });
}
