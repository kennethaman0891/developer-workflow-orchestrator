'use client';

import { useState, useEffect, useCallback } from 'react';
import { CodeEditor } from '@/components/editor/CodeEditor';
import { FileBrowser } from '@/components/ide/FileBrowser';
import { TabBar, type Tab } from '@/components/ide/TabBar';
import { useOpenFiles } from '@/hooks/useOpenFiles';
import { useWorkspaces } from '@/hooks/useWorkspaces';
import { readFile, writeFile } from '@/lib/api';

interface IDEViewProps {
  // If provided, use this workspace directly; otherwise use active workspace
  activeWorkspace?: { id: string; name: string; path: string | null };
}

export function IDEView({ activeWorkspace }: IDEViewProps) {
  const { workspaces, activeId } = useWorkspaces();
  const {
    openFiles,
    activeFilePath,
    addFile,
    closeFile,
    saveFile,
    markDirty,
    setActiveFilePath,
  } = useOpenFiles();

  // Determine which workspace to use
  const workspace = activeWorkspace || workspaces.find(w => w.id === activeId);
  const rootPath = workspace?.path || '';

  // Get file content when switching tabs
  useEffect(() => {
    if (!activeFilePath || !openFiles.has(activeFilePath)) return;
    // Content is already loaded by useOpenFiles
  }, [activeFilePath, openFiles]);

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
    // If file is dirty, save it first
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

  // Handle editor content change
  const handleEditorChange = useCallback((path: string, content: string) => {
    markDirty(path);
  }, [markDirty]);

  // Build tabs array from openFiles
  const tabs: Tab[] = Array.from(openFiles.values()).map(file => ({
    path: file.path,
    dirty: file.dirty,
  }));

  // Find currently active file data
  const activeFile = activeFilePath ? openFiles.get(activeFilePath) : null;

  if (!rootPath) {
    return (
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#888',
        fontSize: '14px',
        gap: '12px',
      }}>
        <div style={{ fontSize: '48px' }}>📁</div>
        <div>No workspace opened</div>
        <div style={{ fontSize: '12px', color: '#555' }}>
          Open a workspace from the sidebar to start editing
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
        }}>
          Explorer
        </div>
        <FileBrowser
          rootPath={rootPath}
          onFileSelect={handleFileSelect}
          className="flex-1"
        />
      </div>

      {/* Right Panel: Editor */}
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        background: '#1e1e1e',
      }}>
        {/* Tab Bar */}
        <TabBar
          tabs={tabs}
          activePath={activeFilePath}
          onTabClick={handleTabClick}
          onTabClose={handleTabClose}
        />

        {/* Editor Area */}
        <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
          {activeFile ? (
            <CodeEditor
              filePath={activeFile.path}
              content={activeFile.content}
              onSave={(path, content) => saveFile(path, content)}
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
              <div>Select a file to edit</div>
              <div style={{ fontSize: '11px', color: '#444' }}>
                Click any file in the explorer to open it
              </div>
              <div style={{ fontSize: '11px', color: '#333', marginTop: '8px' }}>
                Keyboard shortcuts: Ctrl+S to save
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
