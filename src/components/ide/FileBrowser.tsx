'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { invoke } from '@/lib/tauri';
import { FolderIcon, ChevronRight, ChevronDown, FileIcon } from '@/lib/setiIcons';

interface FileNode {
  name: string;
  path: string;
  is_dir: boolean;
  children?: FileNode[];
  expanded?: boolean;
}

/** One node of the backend `list_tree` response (flattened FsEntry + children). */
interface TreeNode {
  name: string;
  path: string;
  is_dir: boolean;
  size?: number | null;
  mtime?: string | null;
  children?: TreeNode[];
}

/** Response of the `list_tree` Tauri command. */
interface TreeListing {
  root: string;
  truncated: boolean;
  entries: TreeNode[];
}

interface FileBrowserProps {
  rootPath: string;
  onFileSelect: (path: string) => void;
  className?: string;
  /**
   * Bump this counter to force a re-read of the tree. Used by the
   * `file-changed` listener in the IDE view so external edits show up
   * without remounting the browser.
   */
  refreshToken?: number;
}

/** Empty listing used as the web-mode fallback (no Tauri runtime). */
function emptyTree(root: string): TreeListing {
  return { root, truncated: false, entries: [] };
}

/**
 * Convert backend tree nodes into render nodes (expansion state included).
 */
function toFileNodes(entries: TreeNode[]): FileNode[] {
  return entries.map(entry => ({
    name: entry.name,
    path: entry.path,
    is_dir: entry.is_dir,
    children: entry.is_dir ? toFileNodes(entry.children ?? []) : undefined,
    expanded: false,
  }));
}

/**
 * Re-apply the expansion set to a freshly loaded tree so a refresh (external
 * file change) does not collapse folders the user had open.
 */
function applyExpansion(nodes: FileNode[], expanded: Set<string>): FileNode[] {
  return nodes.map(node => ({
    ...node,
    expanded: node.is_dir ? expanded.has(node.path) : node.expanded,
    children: node.children ? applyExpansion(node.children, expanded) : node.children,
  }));
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
          <span style={{ fontSize: '12px', width: '12px', justifyContent: 'center' }}>
            {node.expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </span>
          <span>{node.expanded ? <FolderIcon expanded size={14} /> : <FolderIcon size={14} />}</span>
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
      <span style={{ width: '12px', display: 'inline-block' }} />
      <span><FileIcon path={node.path} size={14} /></span>
      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {node.name}
      </span>
    </div>
  );
}

export function FileBrowser({ rootPath, onFileSelect, className, refreshToken }: FileBrowserProps) {
  const [nodes, setNodes] = useState<FileNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  // First load only: a refresh keeps the current tree on screen instead of
  // flashing the "Loading files..." placeholder.
  const loadedRef = useRef(false);
  const expandedRef = useRef(expandedPaths);
  expandedRef.current = expandedPaths;

  // Load the tree when the root changes, and again whenever `refreshToken`
  // is bumped by an external `file-changed` event. A whole `list_tree` call
  // walks the tree in the backend (ignore rules applied there, no recursion
  // here). The cancellation flag keeps a superseded request — StrictMode's
  // double mount, or a rapid burst of refreshes — from clobbering a newer one.
  useEffect(() => {
    if (!rootPath) return;

    let cancelled = false;
    if (!loadedRef.current) setLoading(true);
    setError(null);

    invoke<TreeListing>('list_tree', { path: rootPath }, emptyTree(rootPath))
      .then(listing => {
        if (cancelled) return;
        setNodes(applyExpansion(toFileNodes(listing.entries), expandedRef.current));
        setTruncated(listing.truncated);
        loadedRef.current = true;
      })
      .catch(err => {
        if (cancelled) return;
        console.error('Failed to load file tree:', err);
        setError(err.message || 'Failed to load files');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [rootPath, refreshToken]);

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

      {/* Truncation notice (depth / entry cap hit by the backend) */}
      {truncated && (
        <div style={{
          padding: '4px 12px',
          fontSize: '11px',
          color: '#c9a227',
          borderBottom: '1px solid #2a2a2a',
        }}>
          Listing truncated — hidden entries were skipped or beyond the depth limit.
        </div>
      )}

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
