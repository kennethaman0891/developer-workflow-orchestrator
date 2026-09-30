'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { MonacoEditor, disposeEditorModel } from '@/components/editor/MonacoEditor';
import { ErrorBoundary } from '@/components/diagnostics/ErrorBoundary';
import { FileBrowser } from '@/components/ide/FileBrowser';
import { GitPanel } from '@/components/git/GitPanel';
import { TabBar, type Tab } from '@/components/ide/TabBar';
import { useOpenFiles } from '@/hooks/useOpenFiles';
import { useTheme } from '@/contexts/ThemeContext';
import { readFile, writeFile, pickFolder } from '@/lib/api';
import { LargePlaceholder } from '@/lib/setiIcons';
import { invoke, isTauri } from '@/lib/tauri';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { convertFileSrc } from '@tauri-apps/api/core';

interface IDEViewProps {
  // Optional initial path to start at (e.g., from a workspace)
  initialPath?: string;
}

/**
 * Payload of the backend `file-changed` event.
 *
 * `DwoEvent::FileChanged` is serde-serialized adjacently
 * (`tag = "type"`, `content = "data"`), so the wire shape is
 * `{type: "FileChanged", data: {path, action}}`. The flat form is tolerated
 * as well so a payload change upstream cannot silently break the listener.
 */
interface FileChangedPayload {
  type?: string;
  data?: { path?: string; action?: string };
  path?: string;
  action?: string;
}

/** Frontend debounce for tree refreshes (backend already debounced at 200ms). */
const TREE_REFRESH_MS = 300;

/** Uniform separators and no trailing slash — used to match event paths to tabs. */
function normalizePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/+$/, '');
}

/**
 * Resolve a local file path to a URL the WebView can actually load.
 * `file://` never resolves inside the Tauri WebView / static export, so
 * images and PDFs permanently hit the error fallback in the bundled app.
 * `convertFileSrc()` maps to the `asset:` protocol (allowed by CSP); outside
 * Tauri (browser / Docker) fall back to `file://` as before.
 */
function toViewableUrl(filePath: string): string {
  if (isTauri()) {
    try {
      return convertFileSrc(filePath);
    } catch {
      // Plugin unavailable — fall through to file:// below.
    }
  }
  return `file://${filePath}`;
}

type FileCategory = 'code' | 'image' | 'pdf' | 'other';

/** Image types we can preview inline. */
const IMAGE_EXTS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp', 'ico', 'avif', 'tiff',
]);

/**
 * Known binary / media formats.
 *
 * This is a *denylist*, not an allowlist. The previous implementation listed
 * every text extension it could think of, which meant any language Monaco
 * supported but the list did not (and any file with no extension at all) was
 * rejected with "Cannot preview this file type". Inverting the check means a new
 * language works the day Monaco gains it.
 *
 * More importantly: `read_file` decodes with `read_to_string`, which fails on
 * non-UTF-8 bytes. Classifying binaries explicitly is what keeps them out of the
 * editor rather than surfacing a decoder error.
 */
const BINARY_EXTS = new Set([
  // Archives
  'zip', 'gz', 'tgz', 'bz2', 'xz', 'zst', '7z', 'rar', 'tar', 'jar', 'war', 'iso',
  // Executables & libraries
  'exe', 'dll', 'so', 'dylib', 'a', 'o', 'obj', 'lib', 'bin', 'app', 'msi', 'deb', 'rpm',
  'pyc', 'pyo', 'class', 'wasm', 'node',
  // Documents
  'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'pages', 'numbers', 'key',
  // Audio / video
  'mp3', 'mp4', 'm4a', 'm4v', 'wav', 'flac', 'ogg', 'oga', 'aac', 'avi', 'mov',
  'mkv', 'webm', 'wmv', 'flv',
  // Fonts
  'ttf', 'otf', 'woff', 'woff2', 'eot',
  // Data / databases
  'db', 'sqlite', 'sqlite3', 'mdb', 'parquet', 'feather',
  // Misc binary
  'pem', 'key', 'p12', 'pfx', 'icns', 'db-shm', 'db-wal', 'log',
]);

/**
 * Determine how to render a file.
 *
 * Extensionless files (e.g. `Makefile`, `Dockerfile`, `.env`) are treated as
 * text and handed to Monaco, which resolves their language from its own
 * filename table.
 */
function getFileCategory(path: string): FileCategory {
  const normalized = path.replace(/\\/g, '/');
  const filename = normalized.slice(normalized.lastIndexOf('/') + 1);

  const dot = filename.lastIndexOf('.');
  if (dot <= 0) return 'code'; // dotfile or extensionless text file

  const ext = filename.slice(dot + 1).toLowerCase();

  if (IMAGE_EXTS.has(ext)) return 'image';
  if (ext === 'pdf') return 'pdf';
  if (BINARY_EXTS.has(ext)) return 'other';

  return 'code';
}

function ImageViewer({ filePath, theme }: { filePath: string; theme: any }) {
  const [hasError, setHasError] = useState(false);
  const imageUrl = toViewableUrl(filePath);

  if (hasError) {
    return (
      <div style={{
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: theme.colors.bg,
        padding: '20px',
      }}>
        <div style={{ textAlign: 'center', color: '#888' }}>
          <div style={{ fontSize: '48px', marginBottom: '12px' }}>🖼️</div>
          <div>Failed to load image</div>
          <div style={{ fontSize: '11px', color: '#555', marginTop: '8px' }}>{filePath}</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      height: '100%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: theme.colors.bg,
      overflow: 'auto',
      padding: '20px',
    }}>
      <img
        src={imageUrl}
        alt={filePath}
        style={{
          maxWidth: '100%',
          maxHeight: '100%',
          objectFit: 'contain',
          borderRadius: '4px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
        }}
        onError={() => setHasError(true)}
      />
    </div>
  );
}

function PdfViewer({ filePath }: { filePath: string }) {
  const [hasError, setHasError] = useState(false);
  const pdfUrl = toViewableUrl(filePath);

  if (hasError) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#888' }}>
        <LargePlaceholder type="pdf" />
        <div>PDF preview not available</div>
        <div style={{ fontSize: '11px', color: '#555', marginTop: '8px' }}>Use your system&apos;s PDF viewer</div>
      </div>
    );
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <iframe
        src={pdfUrl}
        style={{
          flex: 1,
          width: '100%',
          border: 'none',
          background: '#fff',
        }}
        title={filePath}
        onError={() => setHasError(true)}
      />
    </div>
  );
}

/**
 * Render appropriate viewer based on file type
 */
function FileViewer({
  filePath,
  content,
  onChange,
  onSave,
  category,
}: {
  filePath: string;
  content: string;
  onChange?: (path: string, content: string) => void;
  onSave?: (path: string, content: string) => void;
  category: FileCategory;
}) {
  const { theme } = useTheme();

  if (category === 'image') {
    return <ImageViewer filePath={filePath} theme={theme} />;
  }

  if (category === 'pdf') {
    return <PdfViewer filePath={filePath} />;
  }

  if (category === 'other') {
    return (
      <div style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#555',
        fontSize: '13px',
        gap: '8px',
        padding: '20px',
      }}>
        <LargePlaceholder type="file" />
        <div>Cannot preview this file type</div>
        <div style={{ fontSize: '11px', color: '#444' }}>
          Supported: Code files, images (PNG, JPG, GIF, SVG, WebP), PDFs
        </div>
      </div>
    );
  }

  // Code/text file - Monaco handles syntax, completion and folding itself.
  // The boundary keeps an editor-side render crash from taking the file tree,
  // tabs and terminal down with it.
  return (
    <ErrorBoundary label="Editor">
      <MonacoEditor
        filePath={filePath}
        content={content}
        onChange={onChange}
        onSave={onSave}
      />
    </ErrorBoundary>
  );
}

export function IDEView({ initialPath }: IDEViewProps) {
  const {
    openFiles,
    activeFilePath,
    fileError,
    clearFileError,
    addFile,
    closeFile,
    saveFile,
    markDirty,
    updateContent,
    setActiveFilePath,
  } = useOpenFiles();
  const { theme } = useTheme();

  // Mirror of `openFiles` for the file-changed listener: keeps the
  // subscription stable instead of re-listening on every tab change.
  const openFilesRef = useRef(openFiles);
  openFilesRef.current = openFiles;

  // Start at initialPath if provided, otherwise user picks folder
  const [currentRootPath, setCurrentRootPath] = useState<string>(initialPath || '');
  const [isPicking, setIsPicking] = useState(false);
  // Bumped by the debounced `file-changed` listener to re-read the file tree.
  const [treeRefreshToken, setTreeRefreshToken] = useState(0);
  // Follow workspace switches: when the parent's initialPath changes (active
  // workspace switched), move the root along — unless the user manually
  // picked a different folder, which always wins.
  const userPickedRef = useRef(false);
  const prevInitialPathRef = useRef(initialPath || '');
  useEffect(() => {
    const next = initialPath || '';
    const prev = prevInitialPathRef.current;
    prevInitialPathRef.current = next;
    if (next !== prev && !userPickedRef.current) {
      setCurrentRootPath(next);
    }
  }, [initialPath]);

  // Watch the current root for external changes; unwatch it when the root
  // changes or the view unmounts. The `null` fallback keeps web mode quiet —
  // `invoke` rejects when called outside Tauri with no fallback.
  useEffect(() => {
    if (!currentRootPath || !isTauri()) return;
    const root = currentRootPath;

    invoke('watch_path', { path: root }, null).catch(err =>
      console.warn('[IDEView] watch_path failed:', err),
    );

    return () => {
      invoke('unwatch_path', { path: root }, null).catch(err =>
        console.warn('[IDEView] unwatch_path failed:', err),
      );
    };
  }, [currentRootPath]);

  // Subscribe to the backend's debounced `file-changed` events: a change to an
  // open file marks that tab dirty, any other change refreshes the tree.
  useEffect(() => {
    if (!isTauri()) return;

    let unlisten: UnlistenFn | null = null;
    let disposed = false;
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;

    // Coalesce bursts so a multi-file change does not hammer `list_tree`.
    const scheduleRefresh = () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => {
        refreshTimer = null;
        setTreeRefreshToken(token => token + 1);
      }, TREE_REFRESH_MS);
    };

    listen<FileChangedPayload>('file-changed', event => {
      const data = event.payload.data ?? event.payload;
      const path = data.path;
      if (!path) return;

      const changed = normalizePath(path);
      const openPath = Array.from(openFilesRef.current.keys()).find(
        key => normalizePath(key) === changed,
      );
      if (openPath) {
        markDirty(openPath);
      } else {
        scheduleRefresh();
      }
    })
      .then(listener => {
        if (disposed) listener();
        else unlisten = listener;
      })
      .catch(err => console.warn('[IDEView] file-changed listener failed:', err));

    return () => {
      disposed = true;
      if (refreshTimer) clearTimeout(refreshTimer);
      unlisten?.();
    };
  }, [markDirty]);

  // Handle folder pick
  const handlePickFolder = useCallback(async () => {
    setIsPicking(true);
    try {
      const path = await pickFolder();
      if (path) {
        userPickedRef.current = true;
        setCurrentRootPath(path);
      }
    } catch (error) {
      console.error('Failed to pick folder:', error);
    } finally {
      setIsPicking(false);
    }
  }, []);

  // Handle file selection from file browser
  const handleFileSelect = useCallback(async (path: string) => {
    await addFile(path);
  }, [addFile]);

  // Handle tab click
  const handleTabClick = useCallback((path: string) => {
    setActiveFilePath(path);
  }, [setActiveFilePath]);

  // Handle tab close. A dirty tab is auto-saved first — but if the save
  // FAILS the tab stays open so edits are never silently dropped.
  const handleTabClose = useCallback(
    async (path: string) => {
      const file = openFiles.get(path);
      if (file?.dirty) {
        try {
          await saveFile(path, file.content);
        } catch {
          return;
        }
      }
      closeFile(path);
      // Release the cached Monaco model so a later reopen re-reads from disk.
      disposeEditorModel(path);
    },
    [openFiles, saveFile, closeFile],
  );

  // Build tabs array
  const tabs: Tab[] = Array.from(openFiles.values()).map(file => ({
    path: file.path,
    dirty: file.dirty,
  }));

  // Find currently active file data
  const activeFile = activeFilePath ? openFiles.get(activeFilePath) : null;

  // Show empty state when no path is set and no workspace
  if (!currentRootPath) {
    return (
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        background: theme.colors.bg,
      }}>
        {/* Left Panel: Prompt to pick folder */}
        <div style={{
          width: '250px',
          minWidth: '200px',
          borderRight: `1px solid ${theme.colors.border}`,
          display: 'flex',
          flexDirection: 'column',
          background: theme.colors.bg,
        }}>
          <div style={{
            padding: '8px 12px',
            borderBottom: `1px solid ${theme.colors.border}`,
            fontSize: '11px',
            color: theme.colors.textMuted,
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          }}>
            Explorer
          </div>
          <div style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
            gap: '16px',
          }}>
            <LargePlaceholder type="folder" />
            <div style={{ fontSize: '14px', color: theme.colors.text, textAlign: 'center' }}>
              Open a Folder
            </div>
            <div style={{ fontSize: '12px', color: theme.colors.textMuted, textAlign: 'center' }}>
              Browse any folder on your system
            </div>
            <button
              onClick={handlePickFolder}
              disabled={isPicking}
              style={{
                marginTop: '12px',
                padding: '8px 20px',
                background: theme.colors.accent,
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                cursor: isPicking ? 'not-allowed' : 'pointer',
                fontSize: '13px',
                fontWeight: 500,
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                transition: 'opacity 0.15s',
              }}
            onMouseEnter={e => { if (!isPicking) e.currentTarget.style.opacity = '0.85'; }}
            onMouseLeave={e => { e.currentTarget.style.opacity = '1'; }}
          >
            {isPicking ? 'Opening...' : 'Select Folder'}
          </button>
          </div>

          {/* Source Control (no workspace yet — shows a friendly empty state) */}
          <GitPanel />
        </div>

        {/* Right Panel: Empty state */}
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          background: theme.colors.bg,
        }}>
          <div style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            color: theme.colors.textMuted,
            fontSize: '13px',
            gap: '8px',
          }}>
            <LargePlaceholder type="file" />
            <div>Select a folder to explore</div>
            <div style={{ fontSize: '11px', color: theme.colors.textMuted, opacity: 0.7 }}>
              Click "Select Folder" in the explorer panel
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      flex: 1,
      display: 'flex',
      overflow: 'hidden',
      background: theme.colors.bg,
    }}>
      {/* Left Panel: File Browser */}
      <div style={{
        width: '250px',
        minWidth: '200px',
        maxWidth: '400px',
        borderRight: `1px solid ${theme.colors.border}`,
        display: 'flex',
        flexDirection: 'column',
        background: theme.colors.bg,
      }}>
        <div style={{
          padding: '8px 12px',
          borderBottom: `1px solid ${theme.colors.border}`,
          fontSize: '11px',
          color: theme.colors.textMuted,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <span>Explorer</span>
          <button
            onClick={handlePickFolder}
            disabled={isPicking}
            style={{
              background: 'none',
              border: 'none',
              color: theme.colors.textMuted,
              cursor: isPicking ? 'not-allowed' : 'pointer',
              fontSize: '11px',
              padding: '2px 6px',
              borderRadius: '4px',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              transition: 'color 0.15s',
            }}
            onMouseEnter={e => { if (!isPicking) e.currentTarget.style.color = theme.colors.text; }}
            onMouseLeave={e => { e.currentTarget.style.color = theme.colors.textMuted; }}
            title="Open different folder"
          >
            <span>➕</span>
            <span>{isPicking ? '...' : 'Add'}</span>
          </button>
        </div>

        {/* Path breadcrumb */}
        <div style={{
          padding: '6px 12px',
          borderBottom: `1px solid ${theme.colors.border}`,
          fontSize: '11px',
          color: theme.colors.textMuted,
          fontFamily: 'monospace',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {currentRootPath}
        </div>

        {/* File tree — flexible so the Source Control section fits below it */}
        <div style={{
          flex: '1 1 auto',
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'auto',
        }}>
          <FileBrowser
            rootPath={currentRootPath}
            onFileSelect={handleFileSelect}
            className="flex-1"
            refreshToken={treeRefreshToken}
          />
        </div>

        {/* Source Control — VS Code-style collapsible git section */}
        <GitPanel projectPath={currentRootPath} />
      </div>

      {/* Right Panel: Editor / Viewer */}
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        background: theme.colors.bg,
      }}>
        {/* Tab Bar */}
        {tabs.length > 0 && (
          <TabBar
            tabs={tabs}
            activePath={activeFilePath}
            onTabClick={handleTabClick}
            onTabClose={handleTabClose}
          />
        )}

        {/* File open/save failure banner */}
        {fileError && (
          <div
            role="alert"
            style={{
              padding: '6px 12px',
              background: '#ff6b6b22',
              borderBottom: '1px solid #ff6b6b44',
              color: '#ff9999',
              fontSize: '11px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              flexShrink: 0,
            }}
          >
            <span style={{ flex: 1 }}>⚠️ {fileError}</span>
            <button
              type="button"
              onClick={clearFileError}
              style={{
                background: 'transparent',
                border: '1px solid #ff6b6b44',
                color: '#ff9999',
                borderRadius: '3px',
                cursor: 'pointer',
                fontSize: '11px',
                padding: '2px 8px',
              }}
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Editor Area */}
        <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
          {activeFile ? (
            <FileViewer
              filePath={activeFile.path}
              content={activeFile.content}
              onChange={(path, next) => updateContent(path, next)}
              onSave={(path, next) => saveFile(path, next)}
              category={getFileCategory(activeFile.path)}
            />
          ) : (
            <div style={{
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              color: theme.colors.textMuted,
              fontSize: '13px',
              userSelect: 'none',
              gap: '8px',
            }}>
        <LargePlaceholder type="file" />
              <div>Select a file to view</div>
              <div style={{ fontSize: '11px', color: theme.colors.textMuted, opacity: 0.7 }}>
                Click any file in the explorer to open it
              </div>
              <div style={{ fontSize: '11px', color: theme.colors.textMuted, opacity: 0.5, marginTop: '8px' }}>
                Supports: Code, Images (PNG, JPG, GIF, SVG), PDFs
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
