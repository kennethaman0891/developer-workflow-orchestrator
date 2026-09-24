/**
 * File System API
 *
 * Centralized module for all file system operations via Tauri backend.
 */

import { invoke } from '@/lib/tauri';

export interface FsEntry {
  name: string;
  path: string;
  is_dir: boolean;
  size?: number;
  mtime?: string;
}

/**
 * List files and directories in a given path
 */
export async function listFiles(path: string): Promise<FsEntry[]> {
  return invoke<FsEntry[]>('list_dir', { path });
}

/**
 * Read file contents
 */
export async function readFile(path: string): Promise<string> {
  return invoke<string>('read_file', { path });
}

/**
 * Write file contents
 */
export async function writeFile(path: string, content: string): Promise<void> {
  return invoke('write_file', { path, content });
}

/**
 * Create a new file
 */
export async function createFile(path: string): Promise<void> {
  return invoke('create_file', { path });
}

/**
 * Create a directory
 */
export async function createDir(path: string): Promise<void> {
  return invoke('create_dir', { path });
}

/**
 * Delete a file or directory
 */
export async function deleteFile(path: string): Promise<void> {
  return invoke('delete', { path });
}

/**
 * Search for files matching a pattern
 */
export async function searchFiles(pattern: string, path?: string): Promise<string[]> {
  return invoke<string[]>('search', { pattern, path });
}
