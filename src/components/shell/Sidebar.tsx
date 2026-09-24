'use client';

import { useState } from 'react';
import { useTheme } from '@/contexts/ThemeContext';
import { useWorkspaces } from '@/hooks/useWorkspaces';
import { useAuth } from '@/contexts/AuthContext';

interface SidebarProps {
  workspaces?: any[];
  activeId?: string;
  setSidebarOpen?: (open: boolean) => void;
  setMainView?: (view: string) => void;
  currentView?: string;
}

const VIEWS = [
  { id: 'workspace', label: 'Workspace', icon: '💻' },
  { id: 'projects', label: 'Projects', icon: '📁' },
  { id: 'ide', label: 'IDE', icon: '✏️' },
  { id: 'collaboration', label: 'Collab', icon: '👥' },
  { id: 'plugins', label: 'Plugins', icon: '🧩' },
  { id: 'settings', label: 'Settings', icon: '⚙️' },
];

export function Sidebar({ workspaces = [], activeId = '', setMainView, currentView = 'workspace' }: SidebarProps) {
  const { theme } = useTheme();
  const { create: createWs, selectFolder, activate: activateWs } = useWorkspaces();
  const { currentUser, signOut } = useAuth();
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

  /**
   * Opens the system folder picker. If user selects a folder,
   * uses the folder name as the workspace name and creates it.
   */
  const handlePickFolder = async () => {
    setIsCreating(true);
    const selectedPath = await selectFolder();
    if (selectedPath) {
      // Extract the folder name for the workspace name
      const folderName = selectedPath.split('/').filter(Boolean).pop() || 'Untitled';
      try {
        await createWs(folderName, selectedPath);
      } catch (error) {
        console.error('Failed to create workspace:', error);
      }
    }
    setIsCreating(false);
  };

  const handleViewChange = (viewId: string) => {
    setLocalView(viewId);
    setMainView?.(viewId);
  };

  const formatPath = (path: string | null): string => {
    if (!path) return '';
    // Show just the last 2-3 components of the path for brevity
    const parts = path.split('/').filter(Boolean);
    if (parts.length <= 2) return path;
    return `…/${parts.slice(-2).join('/')}`;
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
            onClick={handlePickFolder}
            disabled={isCreating}
            style={{
              background: 'none',
              border: 'none',
              color: theme.colors.accent,
              cursor: isCreating ? 'not-allowed' : 'pointer',
              fontSize: '16px',
              lineHeight: 1,
              opacity: isCreating ? 0.5 : 1,
            }}
            title={isCreating ? 'Opening folder picker…' : 'Select folder for new workspace'}
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
              placeholder="Workspace name (optional)"
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
              disabled={!newWsName.trim()}
              style={{
                background: newWsName.trim() ? theme.colors.accent : theme.colors.bgTertiary,
                color: newWsName.trim() ? '#fff' : theme.colors.textMuted,
                border: 'none',
                padding: '4px 8px',
                borderRadius: '4px',
                cursor: newWsName.trim() ? 'pointer' : 'not-allowed',
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
              onClick={() => {
                activateWs(ws.id);
                setMainView?.('ide');
              }}
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
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
                gap: '2px',
              }}
            >
              <span style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: '100%' }}>
                {ws.name}
              </span>
              {ws.path && (
                <span style={{
                  fontSize: '10px',
                  color: theme.colors.textMuted,
                  fontFamily: theme.fonts.monospace,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  width: '100%',
                }}>
                  {formatPath(ws.path)}
                </span>
              )}
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
        {currentUser ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <img
              src={getUserAvatar(currentUser)}
              alt={currentUser.name}
              style={{
                width: '24px',
                height: '24px',
                borderRadius: '50%',
                objectFit: 'cover',
              }}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '11px', color: theme.colors.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {currentUser.name}
              </div>
              <div style={{ fontSize: '9px', color: theme.colors.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {currentUser.email}
              </div>
            </div>
            <button
              onClick={signOut}
              title="Sign out"
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: theme.colors.textMuted,
                padding: '4px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '4px',
                transition: 'color 0.15s, background 0.15s',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.color = theme.colors.error;
                e.currentTarget.style.background = `${theme.colors.error}1a`;
              }}
              onMouseLeave={e => {
                e.currentTarget.style.color = theme.colors.textMuted;
                e.currentTarget.style.background = 'transparent';
              }}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M5 3H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                <path d="M9 10l3-3-3-3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M12 7H7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        ) : (
          <div style={{ fontSize: '9px', color: theme.colors.textMuted, marginBottom: '4px' }}>
            Not signed in
          </div>
        )}
        <div>Free tier · 4 terminals / 2 workspaces</div>
        <div style={{ marginTop: '4px' }}>DWO v2.0.0</div>
      </div>
    </aside>
  );
}

function getUserAvatar(user: { name: string; email: string; avatar: string }): string {
  const initials = user.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  const colors = ['#4a9eff', '#f472b6', '#34d399', '#fbbf24', '#a78bfa'];
  const colorIndex = user.email.charCodeAt(0) % colors.length;
  return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" rx="8" fill="${colors[colorIndex]}"/><text x="50%" y="55%" dominant-baseline="middle" text-anchor="middle" font-family="sans-serif" font-size="16" font-weight="600" fill="white">${initials}</text></svg>`)}`;
}
