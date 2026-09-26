'use client';

import { useState, useEffect, useCallback } from 'react';
import { CodeEditor } from '@/components/editor/CodeEditor';
import { FileBrowser } from '@/components/ide/FileBrowser';
import { TabBar, type Tab } from '@/components/ide/TabBar';
import { useOpenFiles } from '@/hooks/useOpenFiles';
import { readFile, writeFile, pickFolder } from '@/lib/api';

interface IDEViewProps {
  // Optional initial path to start at (e.g., from a workspace)
  initialPath?: string;
}

type FileCategory = 'code' | 'image' | 'pdf' | 'other';

/**
 * Determine file category based on extension
 */
function getFileCategory(path: string): FileCategory {
  const ext = path.split('.').pop()?.toLowerCase();
  if (!ext) return 'other';

  const imageExts = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp', 'ico'];
  if (imageExts.includes(ext)) return 'image';
  if (ext === 'pdf') return 'pdf';

  const codeExts = [
    'ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs',
    'py', 'rs', 'go', 'java', 'c', 'cpp', 'h', 'hpp',
    'rb', 'php', 'swift', 'kt', 'scala',
    'json', 'jsonc', 'yaml', 'yml', 'toml', 'ini', 'cfg', 'conf',
    'md', 'markdown', 'txt', 'text',
    'html', 'htm', 'xhtml',
    'css', 'scss', 'less', 'sass',
    'xml', 'plist', 'svg',
    'sh', 'bash', 'zsh', 'fish',
    'env', 'gitignore', 'dockerignore',
    'sql', 'graphql', 'gql',
    'vue', 'svelte',
    'lua', 'r', 'R', 'julia',
  ];
  if (codeExts.includes(ext)) return 'code';

  return 'other';
}

/**
 * Render appropriate viewer based on file type
 */
function FileViewer({
  filePath,
  content,
  onSave,
  category,
}: {
  filePath: string;
  content: string;
  onSave?: (path: string, content: string) => void;
  category: FileCategory;
}) {
  if (category === 'image') {
    const imageUrl = `file://${filePath}`;
    return (
      <div style={{
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#0a0a0a',
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
          onError={(e) => {
            e.currentTarget.style.display = 'none';
            const parent = e.currentTarget.parentElement;
            if (parent) {
              parent.innerHTML = `
                <div style="text-align: center; color: #888;">
                  <div style="font-size: 48px; margin-bottom: 12px;">🖼️</div>
                  <div>Failed to load image</div>
                  <div style="font-size: 11px; color: #555; margin-top: 8px;">${filePath}</div>
                </div>
              `;
            }
          }}
        />
      </div>
    );
  }

  if (category === 'pdf') {
    const pdfUrl = `file://${filePath}`;
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
          onError={() => {
            const container = document.getElementById('pdf-container');
            if (container) {
              container.innerHTML = `
                <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; color: #888;">
                  <div style="font-size: 48px; margin-bottom: 12px;">📄</div>
                  <div>PDF preview not available</div>
                  <div style="font-size: 11px; color: #555; margin-top: 8px;">Use your system's PDF viewer</div>
                </div>
              `;
            }
          }}
        />
      </div>
    );
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
        <div style={{ fontSize: '48px' }}>📄</div>
        <div>Cannot preview this file type</div>
        <div style={{ fontSize: '11px', color: '#444' }}>
          Supported: Code files, images (PNG, JPG, GIF, SVG, WebP), PDFs
        </div>
      </div>
    );
  }

  // Code/text file - use CodeEditor
  return (
    <CodeEditor
      filePath={filePath}
      content={content}
      onSave={onSave}
    />
  );
}

export function IDEView({ initialPath }: IDEViewProps) {
  const {
    openFiles,
    activeFilePath,
    addFile,
    closeFile,
    saveFile,
    markDirty,
    setActiveFilePath,
  } = useOpenFiles();

  // Start at initialPath if provided, otherwise user picks folder
  const [currentRootPath, setCurrentRootPath] = useState<string>(initialPath || '');
  const [isPicking, setIsPicking] = useState(false);

  // Handle folder pick
  const handlePickFolder = useCallback(async () => {
    setIsPicking(true);
    try {
      const path = await pickFolder();
      if (path) {
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

  // Handle tab close
  const handleTabClose = useCallback(async (path: string) => {
    const file = openFiles.get(path);
    if (file?.dirty) {
      try {
        await saveFile(path, file.content);
      } catch (error) {
        console.error('Failed to auto-save before close:', error);
      }
    }
    closeFile(path);
  }, [openFiles, saveFile, closeFile]);

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
        background: '#1e1e1e',
      }}>
        {/* Left Panel: Prompt to pick folder */}
        <div style={{
          width: '250px',
          minWidth: '200px',
          borderRight: '1px solid #2a2a2a',
          display: 'flex',
          flexDirection: 'column',
          background: '#1e1e1e',
        }}>
          <div style={{
            padding: '8px 12px',
            borderBottom: '1px solid #2a2a2a',
            fontSize: '11px',
            color: '#888',
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
            <div style={{ fontSize: '48px' }}>📁</div>
            <div style={{ fontSize: '14px', color: '#e8e8e8', textAlign: 'center' }}>
              Open a Folder
            </div>
            <div style={{ fontSize: '12px', color: '#888', textAlign: 'center' }}>
              Browse any folder on your system
            </div>
            <button
              onClick={handlePickFolder}
              disabled={isPicking}
              style={{
                marginTop: '12px',
                padding: '8px 20px',
                background: '#4a9eff',
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
        </div>

        {/* Right Panel: Empty state */}
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          background: '#1e1e1e',
        }}>
          <div style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#555',
            fontSize: '13px',
            gap: '8px',
          }}>
            <div style={{ fontSize: '48px' }}>📄</div>
            <div>Select a folder to explore</div>
            <div style={{ fontSize: '11px', color: '#444' }}>
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
      background: '#1e1e1e',
    }}>
      {/* Left Panel: File Browser */}
      <div style={{
        width: '250px',
        minWidth: '200px',
        maxWidth: '400px',
        borderRight: '1px solid #2a2a2a',
        display: 'flex',
        flexDirection: 'column',
        background: '#1e1e1e',
      }}>
        <div style={{
          padding: '8px 12px',
          borderBottom: '1px solid #2a2a2a',
          fontSize: '11px',
          color: '#888',
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
              color: '#888',
              cursor: isPicking ? 'not-allowed' : 'pointer',
              fontSize: '11px',
              padding: '2px 6px',
              borderRadius: '4px',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              transition: 'color 0.15s',
            }}
            onMouseEnter={e => { if (!isPicking) e.currentTarget.style.color = '#e8e8e8'; }}
            onMouseLeave={e => { e.currentTarget.style.color = '#888'; }}
            title="Open different folder"
          >
            <span>➕</span>
            <span>{isPicking ? '...' : 'Add'}</span>
          </button>
        </div>

        {/* Path breadcrumb */}
        <div style={{
          padding: '6px 12px',
          borderBottom: '1px solid #2a2a2a',
          fontSize: '11px',
          color: '#666',
          fontFamily: 'monospace',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {currentRootPath}
        </div>

        <FileBrowser
          rootPath={currentRootPath}
          onFileSelect={handleFileSelect}
          className="flex-1"
        />
      </div>

      {/* Right Panel: Editor / Viewer */}
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        background: '#1e1e1e',
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

        {/* Editor Area */}
        <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
          {activeFile ? (
            <FileViewer
              filePath={activeFile.path}
              content={activeFile.content}
              onSave={(path, content) => saveFile(path, content)}
              category={getFileCategory(activeFile.path)}
            />
          ) : (
            <div style={{
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#555',
              fontSize: '13px',
              userSelect: 'none',
              gap: '8px',
            }}>
              <div style={{ fontSize: '48px' }}>📄</div>
              <div>Select a file to view</div>
              <div style={{ fontSize: '11px', color: '#444' }}>
                Click any file in the explorer to open it
              </div>
              <div style={{ fontSize: '11px', color: '#333', marginTop: '8px' }}>
                Supports: Code, Images (PNG, JPG, GIF, SVG), PDFs
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
