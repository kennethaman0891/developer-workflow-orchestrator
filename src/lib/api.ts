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
 * Search for files whose *content* matches a pattern (legacy shape).
 *
 * Returns the de-duplicated paths of matching files. Prefer
 * {@link searchContent} for structured results with line numbers and the
 * `truncated` flag.
 */
export async function searchFiles(pattern: string, path?: string): Promise<string[]> {
  return invoke<string[]>('search', { pattern, path });
}

/** One content match inside a file (mirrors the Rust `SearchResult`). */
export interface SearchResult {
  path: string;
  line_number: number;
  line_text: string;
  byte_offset: number;
}

/** Result of the bounded content search (mirrors the Rust `SearchResponse`). */
export interface SearchResponse {
  /** Matches in walk order — capped at 500 by the backend. */
  results: SearchResult[];
  /** True when the result cap (500) or the time budget (2s) ended the walk. */
  truncated: boolean;
}

/**
 * Bounded, ripgrep-style content search.
 *
 * The backend skips binary/huge files and `node_modules`/`target`/`dist`/
 * `.gitignore`d paths, never follows symlinks, and stops after 500 results
 * or 2000ms (`truncated` reports which bound ended the search).
 *
 * @param pattern        Literal substring by default; compiled as a regex
 *                       only when it is valid and <= 512 bytes.
 * @param path           Directory to search (defaults to the backend cwd).
 * @param caseSensitive  Defaults to `true`.
 * @param glob           Optional file-name filter, e.g. `*.rs`.
 */
export async function searchContent(
  pattern: string,
  path?: string,
  caseSensitive?: boolean,
  glob?: string,
): Promise<SearchResponse> {
  return invoke<SearchResponse>('search_files', {
    pattern,
    path,
    caseSensitive,
    glob,
  });
}

/**
 * Open system folder picker dialog and return selected path
 */
export async function pickFolder(): Promise<string | null> {
  return invoke<string | null>('select_workspace_folder');
}
