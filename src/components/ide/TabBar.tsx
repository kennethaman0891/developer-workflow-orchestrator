'use client';

import { useState, useCallback } from 'react';
import { FileIcon } from '@/lib/setiIcons';
import { useTheme } from '@/contexts/ThemeContext';

export interface Tab {
  path: string;
  dirty: boolean;
}

interface TabBarProps {
  tabs: Tab[];
  activePath: string | null;
  onTabClick: (path: string) => void;
  onTabClose: (path: string) => void;
  className?: string;
}

function getFileName(path: string): string {
  return path.split('/').pop() || path;
}

export function TabBar({ tabs, activePath, onTabClick, onTabClose, className }: TabBarProps) {
  const { theme } = useTheme();
  const [hoveredTab, setHoveredTab] = useState<string | null>(null);

  if (tabs.length === 0) return null;

  return (
    <div
      className={className}
      style={{
        display: 'flex',
        background: 'var(--dwo-color-bg)',
        borderBottom: `1px solid ${'var(--dwo-color-border)'}`,
        // Tabs scroll horizontally instead of clipping past 6+ open files.
        overflowX: 'auto',
        overflowY: 'hidden',
        height: '35px',
        flexShrink: 0,
        scrollbarWidth: 'thin',
      }}
    >
      {tabs.map(tab => {
        const isActive = tab.path === activePath;
        const isHovered = tab.path === hoveredTab;
        return (
          <div
            key={tab.path}
            onClick={() => onTabClick(tab.path)}
            onMouseEnter={() => setHoveredTab(tab.path)}
            onMouseLeave={() => setHoveredTab(null)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '0 12px',
              cursor: 'pointer',
              fontSize: '12px',
              color: isActive ? 'var(--dwo-color-text)' : (isHovered ? 'var(--dwo-color-text)' : 'var(--dwo-color-text-muted)'),
              background: isActive ? 'var(--dwo-color-bg-tertiary)' : (isHovered ? 'var(--dwo-color-bg-secondary)' : 'var(--dwo-color-bg)'),
              borderRight: `1px solid ${'var(--dwo-color-border)'}`,
              borderTop: isActive ? `2px solid ${'var(--dwo-color-accent)'}` : '2px solid transparent',
              transition: 'all 0.15s',
              whiteSpace: 'nowrap',
              minWidth: '100px',
              maxWidth: '200px',
              flexShrink: 0,
              position: 'relative',
            }}
          >
            <span style={{ flexShrink: 0 }}><FileIcon path={tab.path} size={13} /></span>
            <span style={{
              flex: 1,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace',
            }}>
              {getFileName(tab.path)}
              {tab.dirty && <span style={{ color: 'var(--dwo-color-error)', marginLeft: '4px' }}>●</span>}
            </span>
            <button
              onClick={e => { e.stopPropagation(); onTabClose(tab.path); }}
              style={{
                background: 'none',
                border: 'none',
                color: isActive || isHovered ? 'var(--dwo-color-text-muted)' : 'transparent',
                cursor: 'pointer',
                fontSize: '14px',
                lineHeight: 1,
                padding: '2px 2px',
                borderRadius: '3px',
                display: 'flex',
                alignItems: 'center',
                transition: 'all 0.1s',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.color = 'var(--dwo-color-text)';
                e.currentTarget.style.background = 'var(--dwo-color-bg-tertiary)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.color = (isActive || isHovered) ? 'var(--dwo-color-text-muted)' : 'transparent';
                e.currentTarget.style.background = 'none';
              }}
              title="Close tab"
            >
              ×
            </button>
          </div>
        );
      })}
    </div>
  );
}
