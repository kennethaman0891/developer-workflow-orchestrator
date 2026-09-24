'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { listFiles, type FsEntry } from '@/lib/api';

interface FileNode {
  name: string;
  path: string;
  is_dir: boolean;
  children?: FileNode[];
  expanded?: boolean;
}

interface FileBrowserProps {
  rootPath: string;
  onFileSelect: (path: string) => void;
  className?: string;
}

/**
 * Recursively build a file tree from flat directory listings
 */
async function buildRecursiveTree(
  basePath: string,
  depth: number = 0,
  maxDepth: number = 5,
): Promise<FileNode[]> {
  if (depth > maxDepth) return [];

  let entries: FsEntry[];
  try {
    entries = await listFiles(basePath);
  } catch (error) {
    console.error(`Failed to list ${basePath}:`, error);
    return [];
  }

  // Separate dirs and files
  const dirs = entries.filter(e => e.is_dir).sort((a, b) => a.name.localeCompare(b.name));
  const files = entries.filter(e => !e.is_dir).sort((a, b) => a.name.localeCompare(b.name));

  const nodes: FileNode[] = [];

  // Add directories first
  for (const dir of dirs) {
    const children = await buildRecursiveTree(dir.path, depth + 1, maxDepth);
    nodes.push({
      name: dir.name,
      path: dir.path,
      is_dir: true,
      children,
      expanded: false,
    });
  }

  // Add files
  for (const file of files) {
    nodes.push({
      name: file.name,
      path: file.path,
      is_dir: false,
    });
  }

  return nodes;
}

function FileNodeComponent({
  node,
  depth,
  onFileSelect,
  onToggle,
}: {
  node: FileNode;
  depth: number;
  onFileSelect: (path: string) => void;
  onToggle: (path: string) => void;
}) {
  if (node.is_dir) {
    return (
      <div>
        <div
          onClick={() => onToggle(node.path)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            padding: '3px 8px',
            cursor: 'pointer',
            fontSize: '12px',
            color: '#e8e8e8',
            background: 'transparent',
            transition: 'background 0.1s',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = '#2a2a2a'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
        >
          <span style={{ fontSize: '10px', width: '12px', display: 'inline-block' }}>
            {node.expanded ? '▼' : '▶'}
          </span>
          <span style={{ fontSize: '14px' }}>{node.expanded ? '📂' : '📁'}</span>
          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {node.name}
          </span>
        </div>
        {node.expanded && node.children?.map(child => (
          <FileNodeComponent
            key={child.path}
            node={child}
            depth={depth + 1}
            onFileSelect={onFileSelect}
            onToggle={onToggle}
          />
        ))}
      </div>
    );
  }

  return (
    <div
      onClick={() => onFileSelect(node.path)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        padding: '3px 8px',
        paddingLeft: `${8 + depth * 16}px`,
        cursor: 'pointer',
        fontSize: '12px',
        color: '#e8e8e8',
        background: 'transparent',
        transition: 'background 0.1s',
      }}
      onMouseEnter={e => { e.currentTarget.style.background = '#2a2a2a'; }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
    >
      <span style={{ fontSize: '10px', width: '12px', display: 'inline-block' }} />
      <span style={{ fontSize: '14px' }}>📄</span>
      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {node.name}
      </span>
    </div>
  );
}

export function FileBrowser({ rootPath, onFileSelect, className }: FileBrowserProps) {
  const [nodes, setNodes] = useState<FileNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  const loadedRef = useRef(false);

  // Load tree when rootPath changes
  useEffect(() => {
    if (!rootPath || loadedRef.current) return;

    setLoading(true);
    setError(null);

    buildRecursiveTree(rootPath)
      .then(result => {
        setNodes(result);
        loadedRef.current = true;
      })
      .catch(err => {
        console.error('Failed to build file tree:', err);
        setError(err.message || 'Failed to load files');
      })
      .finally(() => {
        setLoading(false);
      });
  }, [rootPath]);

  const handleToggle = useCallback((path: string) => {
    setExpandedPaths(prev => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  // Toggle expand state in nodes
  const updateNodeExpansion = useCallback((nodes: FileNode[], path: string, expanded: boolean): FileNode[] => {
    return nodes.map(node => {
      if (node.path === path) {
        return { ...node, expanded };
      }
      if (node.children) {
        return { ...node, children: updateNodeExpansion(node.children, path, expanded) };
      }
      return node;
    });
  }, []);

  const handleToggleNode = useCallback((path: string) => {
    const isExpanded = expandedPaths.has(path);
    if (isExpanded) {
      setExpandedPaths(prev => {
        const next = new Set(prev);
        next.delete(path);
        return next;
      });
      setNodes(nodes => updateNodeExpansion(nodes, path, false));
    } else {
      setExpandedPaths(prev => new Set(prev).add(path));
      setNodes(nodes => updateNodeExpansion(nodes, path, true));
    }
  }, [expandedPaths, updateNodeExpansion]);

  if (loading) {
    return (
      <div style={{
        padding: '12px',
        color: '#888',
        fontSize: '12px',
        textAlign: 'center',
      }}>
        Loading files...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{
        padding: '12px',
        color: '#e85d75',
        fontSize: '12px',
        textAlign: 'center',
      }}>
        Error: {error}
      </div>
    );
  }

  return (
    <div className={className} style={{
      height: '100%',
      overflow: 'auto',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    }}>
      {/* Root path display */}
      <div style={{
        padding: '8px 12px',
        fontSize: '11px',
        color: '#888',
        borderBottom: '1px solid #2a2a2a',
        fontFamily: 'monospace',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}>
        {rootPath || '/'}
      </div>

      {/* File tree */}
      <div style={{ padding: '4px 0' }}>
        {nodes.map(node => (
          <FileNodeComponent
            key={node.path}
            node={{ ...node, expanded: expandedPaths.has(node.path) }}
            depth={0}
            onFileSelect={onFileSelect}
            onToggle={handleToggleNode}
          />
        ))}
        {nodes.length === 0 && (
          <div style={{
            padding: '12px',
            textAlign: 'center',
            color: '#555',
            fontSize: '11px',
          }}>
            Empty directory
          </div>
        )}
      </div>
    </div>
  );
}
