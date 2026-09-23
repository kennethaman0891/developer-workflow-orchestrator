'use client';

import { useState } from 'react';
import { useTheme } from '@/contexts/ThemeContext';
import { useWorkspaces } from '@/hooks/useWorkspaces';

interface SidebarProps {
  workspaces?: any[];
  activeId?: string;
  setSidebarOpen?: (open: boolean) => void;
  setMainView?: (view: string) => void;
  currentView?: string;
}

const VIEWS = [
  { id: 'projects', label: 'Projects', icon: '📁' },
  { id: 'ide', label: 'IDE', icon: '✏️' },
  { id: 'git', label: 'Git', icon: '🌿' },
  { id: 'tasks', label: 'Tasks', icon: '⏰' },
  { id: 'collaboration', label: 'Collab', icon: '👥' },
  { id: 'plugins', label: 'Plugins', icon: '🧩' },
  { id: 'distribution', label: 'Build', icon: '📦' },
  { id: 'license', label: 'License', icon: '🔑' },
  { id: 'settings', label: 'Settings', icon: '⚙️' },
];

export function Sidebar({ workspaces = [], activeId = '', setMainView, currentView = 'workspace' }: SidebarProps) {
  const { theme } = useTheme();
  const { create: createWs } = useWorkspaces();
  const [newWsName, setNewWsName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [localView, setLocalView] = useState(currentView);

  const handleCreateWorkspace = async () => {
    if (!newWsName.trim()) return;
    setIsCreating(true);
    try {
      await createWs(newWsName);
      setNewWsName('');
      setIsCreating(false);
    } catch (error) {
      console.error('Failed to create workspace:', error);
      setIsCreating(false);
    }
  };

  const handleViewChange = (viewId: string) => {
    setLocalView(viewId);
    setMainView?.(viewId);
  };

  return (
    <aside style={{
      width: '240px',
      minHeight: '100vh',
      background: theme.colors.bgSecondary,
      borderRight: `1px solid ${theme.colors.border}`,
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
    }}>
      {/* Logo */}
      <div style={{
        padding: '16px',
        borderBottom: `1px solid ${theme.colors.border}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <img
            src="/logo.png"
            alt="DWO"
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '6px',
              objectFit: 'contain',
            }}
            onError={(e) => {
              // Fallback: hide broken image and show DWO text prominently
              e.currentTarget.style.display = 'none';
            }}
          />
          <div>
            <div style={{ fontSize: '14px', fontWeight: 600, color: theme.colors.text }}>DWO</div>
            <div style={{ fontSize: '10px', color: theme.colors.textMuted }}>Developer Workflow Orchestrator</div>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <div style={{ padding: '12px', borderBottom: `1px solid ${theme.colors.border}` }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {VIEWS.map(view => (
            <button
              key={view.id}
              onClick={() => handleViewChange(view.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 10px',
                background: localView === view.id ? theme.colors.bgTertiary : 'transparent',
                border: 'none',
                borderRadius: '4px',
                color: localView === view.id ? theme.colors.text : theme.colors.textMuted,
                cursor: 'pointer',
                fontSize: '12px',
                textAlign: 'left',
                width: '100%',
              }}
              onMouseEnter={e => {
                if (localView !== view.id) e.currentTarget.style.background = theme.colors.bgTertiary;
              }}
              onMouseLeave={e => {
                if (localView !== view.id) e.currentTarget.style.background = 'transparent';
              }}
            >
              <span style={{ fontSize: '14px' }}>{view.icon}</span>
              <span>{view.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Workspaces */}
      <div style={{ flex: 1, overflow: 'auto', padding: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
          <span style={{ fontSize: '11px', color: theme.colors.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Workspaces
          </span>
          <button
            onClick={() => setIsCreating(true)}
            style={{
              background: 'none',
              border: 'none',
              color: theme.colors.accent,
              cursor: 'pointer',
              fontSize: '16px',
              lineHeight: 1,
            }}
          >
            +
          </button>
        </div>

        {isCreating && (
          <div style={{ marginBottom: '8px', display: 'flex', gap: '4px' }}>
            <input
              type="text"
              value={newWsName}
              onChange={e => setNewWsName(e.target.value)}
              placeholder="Workspace name"
              style={{
                flex: 1,
                background: theme.colors.bg,
                border: `1px solid ${theme.colors.border}`,
                color: theme.colors.text,
                padding: '4px 8px',
                borderRadius: '4px',
                fontSize: '12px',
              }}
              autoFocus
            />
            <button
              onClick={handleCreateWorkspace}
              style={{
                background: theme.colors.accent,
                color: '#fff',
                border: 'none',
                padding: '4px 8px',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '12px',
              }}
            >
              OK
            </button>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          {workspaces.map((ws: any) => (
            <button
              key={ws.id}
              style={{
                width: '100%',
                textAlign: 'left',
                padding: '6px 8px',
                background: ws.id === activeId ? theme.colors.bgTertiary : 'transparent',
                border: 'none',
                color: ws.id === activeId ? theme.colors.text : theme.colors.textMuted,
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '12px',
              }}
            >
              {ws.name}
            </button>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div style={{
        padding: '12px',
        borderTop: `1px solid ${theme.colors.border}`,
        fontSize: '10px',
        color: theme.colors.textMuted,
      }}>
        <div>Free tier · 4 terminals / 2 workspaces</div>
        <div style={{ marginTop: '4px' }}>DWO v2.0.0</div>
      </div>
    </aside>
  );
}
