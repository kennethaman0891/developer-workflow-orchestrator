'use client';

import { useState } from 'react';
import { useFileSystem, FsEntry } from '@/hooks/useFileSystem';
import { useTheme } from '@/contexts/ThemeContext';

interface FileTreeProps {
  onFileSelect?: (path: string) => void;
}

export function FileTree({ onFileSelect }: FileTreeProps) {
  const { theme } = useTheme();
  const { entries, currentPath, loading, list, createFile, createDir, delete: deleteEntry } = useFileSystem();
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());
  const [newItemName, setNewItemName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [createType, setCreateType] = useState<'file' | 'dir'>('file');

  const toggleDir = (path: string) => {
    setExpandedDirs(prev => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  const handleDoubleClick = async (entry: FsEntry) => {
    if (entry.is_dir) {
      toggleDir(entry.path);
      await list(entry.path);
    } else {
      onFileSelect?.(entry.path);
    }
  };

  const handleCreate = async () => {
    if (!newItemName.trim()) return;
    const path = `${currentPath}/${newItemName}`;
    try {
      if (createType === 'file') {
        await createFile(path);
      } else {
        await createDir(path);
      }
      await list(currentPath);
      setNewItemName('');
      setIsCreating(false);
    } catch (error) {
      console.error('Failed to create:', error);
    }
  };

  const handleDelete = async (entry: FsEntry) => {
    if (confirm(`Delete ${entry.name}?`)) {
      try {
        await deleteEntry(entry.path);
        await list(currentPath);
      } catch (error) {
        console.error('Failed to delete:', error);
      }
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '8px', color: theme.colors.textMuted, fontSize: '12px' }}>
        Loading...
      </div>
    );
  }

  return (
    <div>
      {/* Path display */}
      <div style={{
        padding: '8px',
        fontSize: '11px',
        color: theme.colors.textMuted,
        borderBottom: `1px solid ${theme.colors.border}`,
        fontFamily: 'monospace',
      }}>
        {currentPath}
      </div>

      {/* Create button */}
      <div style={{
        padding: '4px 8px',
        borderBottom: `1px solid ${theme.colors.border}`,
        display: 'flex',
        gap: '4px',
      }}>
        <button
          onClick={() => { setCreateType('file'); setIsCreating(true); }}
          style={styles.smallBtn(theme)}
        >
          + File
        </button>
        <button
          onClick={() => { setCreateType('dir'); setIsCreating(true); }}
          style={styles.smallBtn(theme)}
        >
          + Folder
        </button>
      </div>

      {/* Create input */}
      {isCreating && (
        <div style={{ padding: '4px 8px', display: 'flex', gap: '4px' }}>
          <input
            type="text"
            value={newItemName}
            onChange={e => setNewItemName(e.target.value)}
            placeholder={createType === 'file' ? 'filename.txt' : 'foldername'}
            style={{
              flex: 1,
              background: theme.colors.bg,
              border: `1px solid ${theme.colors.border}`,
              color: theme.colors.text,
              padding: '2px 6px',
              borderRadius: '3px',
              fontSize: '11px',
            }}
            autoFocus
            onKeyDown={e => e.key === 'Enter' && handleCreate()}
          />
          <button onClick={handleCreate} style={styles.smallBtn(theme)}>OK</button>
          <button onClick={() => setIsCreating(false)} style={styles.smallBtn(theme)}>✕</button>
        </div>
      )}

      {/* File list */}
      <div style={{ overflow: 'auto', maxHeight: '300px' }}>
        {entries.length === 0 ? (
          <div style={{ padding: '12px', textAlign: 'center', color: theme.colors.textMuted, fontSize: '11px' }}>
            Empty directory
          </div>
        ) : (
          entries.map(entry => (
            <div
              key={entry.path}
              onDoubleClick={() => handleDoubleClick(entry)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '3px 8px',
                cursor: 'pointer',
                fontSize: '11px',
                color: entry.is_dir ? theme.colors.accent : theme.colors.text,
                background: 'transparent',
                transition: 'background 0.1s',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = theme.colors.bgTertiary)}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <span style={{ fontSize: '12px' }}>
                {entry.is_dir ? (expandedDirs.has(entry.path) ? '📂' : '📁') : '📄'}
              </span>
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {entry.name}
              </span>
              <button
                onClick={e => { e.stopPropagation(); handleDelete(entry); }}
                style={{ ...styles.iconBtn(theme), opacity: 0.5 }}
                title="Delete"
              >
                ✕
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

const styles = {
  smallBtn: (t: any) => ({
    background: t.colors.bgTertiary,
    border: `1px solid ${t.colors.border}`,
    color: t.colors.textMuted,
    padding: '2px 6px',
    borderRadius: '3px',
    cursor: 'pointer',
    fontSize: '10px',
  }),
  iconBtn: (t: any) => ({
    background: 'none',
    border: 'none',
    color: t.colors.textMuted,
    cursor: 'pointer',
    fontSize: '10px',
    padding: '0 2px',
  }),
};
