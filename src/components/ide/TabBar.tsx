'use client';

import { useState, useCallback } from 'react';
import { FileIcon } from '@/lib/setiIcons';

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
  const [hoveredTab, setHoveredTab] = useState<string | null>(null);

  if (tabs.length === 0) return null;

  return (
    <div
      className={className}
      style={{
        display: 'flex',
        background: '#1e1e1e',
        borderBottom: '1px solid #2a2a2a',
        overflow: 'hidden',
        height: '35px',
        flexShrink: 0,
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
              color: isActive ? '#e8e8e8' : (isHovered ? '#c8c8c8' : '#888'),
              background: isActive ? '#2d2d2d' : (isHovered ? '#252525' : '#1e1e1e'),
              borderRight: '1px solid #2a2a2a',
              borderTop: isActive ? '2px solid #4a9eff' : '2px solid transparent',
              transition: 'all 0.15s',
              whiteSpace: 'nowrap',
              minWidth: '100px',
              maxWidth: '200px',
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
              {tab.dirty && <span style={{ color: '#e85d75', marginLeft: '4px' }}>●</span>}
            </span>
            <button
              onClick={e => { e.stopPropagation(); onTabClose(tab.path); }}
              style={{
                background: 'none',
                border: 'none',
                color: isActive || isHovered ? '#aaa' : 'transparent',
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
                e.currentTarget.style.color = '#e8e8e8';
                e.currentTarget.style.background = '#3a3a3a';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.color = (isActive || isHovered) ? '#aaa' : 'transparent';
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
