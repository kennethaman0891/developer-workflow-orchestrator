'use client';

import { useState, type ReactNode } from 'react';
import { useTheme } from '@/contexts/ThemeContext';
import { useWorkspaces } from '@/hooks/useWorkspaces';
import { useAuth } from '@/contexts/AuthContext';

type ViewId = 'workspace' | 'projects' | 'ide' | 'collaboration' | 'settings';

interface SidebarProps {
  workspaces?: any[];
  activeId?: string;
  setSidebarOpen?: (open: boolean) => void;
  setMainView?: (view: string) => void;
  currentView?: string;
  onCreateTerminal?: () => void;
}

interface ViewItem {
  id: ViewId;
  label: string;
  icon: (color: string) => ReactNode;
}

const VIEW_ICONS: Record<ViewId, (color: string) => ReactNode> = {
  workspace: (color) => (
    <svg viewBox="0 0 16 16" fill="none" stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" style={{ width: 16, height: 16 }}>
      <rect x="1" y="2" width="14" height="9" rx="1.5" />
      <path d="M4 14h8" />
      <path d="M8 11v3" />
    </svg>
  ),
  projects: (color) => (
    <svg viewBox="0 0 16 16" fill="none" stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" style={{ width: 16, height: 16 }}>
      <path d="M1 4a1 1 0 011-1h3.5l1 1H14a1 1 0 011 1v7a1 1 0 01-1 1H2a1 1 0 01-1-1V4z" />
    </svg>
  ),
  ide: (color) => (
    <svg viewBox="0 0 16 16" fill="none" stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" style={{ width: 16, height: 16 }}>
      <path d="M13.5 2.5l-9 9-3.5 1 1-3.5 9-9a1.06 1.06 0 011.5 1.5z" />
      <path d="M10.5 5.5l2 2" />
    </svg>
  ),
  collaboration: (color) => (
    <svg viewBox="0 0 16 16" fill="none" stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" style={{ width: 16, height: 16 }}>
      <circle cx="6" cy="5" r="2.5" />
      <circle cx="10" cy="5" r="2" />
      <path d="M1 13c0-2.5 2-4.5 5-4.5s5 2 5 4.5" />
      <path d="M11 9c2.5 0 4 1.5 4 4" />
    </svg>
  ),
  settings: (color) => (
    <svg viewBox="0 0 16 16" fill="none" stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" style={{ width: 16, height: 16 }}>
      <circle cx="8" cy="8" r="2.5" />
      <path d="M13.5 8a5.5 5.5 0 01-.2 1.4l1.2.8-1 1.7-1.5-.6a5.5 5.5 0 01-1.2.7l-.2 1.4v1.8h-2l-.2-1.4a5.5 5.5 0 01-1.2-.7l-1.5.6-1-1.7 1.2-.8a5.5 5.5 0 01-.2-1.4 5.5 5.5 0 01.2-1.4l-1.2-.8 1-1.7 1.5.6a5.5 5.5 0 011.2-.7l.2-1.4V2h2l.2 1.4a5.5 5.5 0 011.2.7l1.5-.6 1 1.7-1.2.8c.1.5.2.9.2 1.4z" />
    </svg>
  ),
};

const VIEWS: ViewItem[] = [
  { id: 'workspace', label: 'Workspace', icon: VIEW_ICONS.workspace },
  { id: 'projects', label: 'Projects', icon: VIEW_ICONS.projects },
  { id: 'ide', label: 'IDE', icon: VIEW_ICONS.ide },
  { id: 'collaboration', label: 'Collab', icon: VIEW_ICONS.collaboration },
  { id: 'settings', label: 'Settings', icon: VIEW_ICONS.settings },
];

export function Sidebar({ workspaces = [], activeId = '', setSidebarOpen, setMainView, currentView = 'workspace', onCreateTerminal }: SidebarProps) {
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
    console.log('[Sidebar] handlePickFolder clicked');
    setIsCreating(true);
    try {
      const selectedPath = await selectFolder();
      console.log('[Sidebar] selectFolder returned:', selectedPath);
      if (selectedPath) {
        // Extract the folder name for the workspace name
        const folderName = selectedPath.split('/').filter(Boolean).pop() || 'Untitled';
        console.log('[Sidebar] Creating workspace with name:', folderName, 'path:', selectedPath);
        try {
          await createWs(folderName, selectedPath);
          console.log('[Sidebar] Workspace created successfully');
        } catch (error) {
          console.error('Failed to create workspace:', error);
        }
      } else {
        console.log('[Sidebar] User cancelled folder selection');
      }
    } catch (error) {
      console.error('[Sidebar] Error in handlePickFolder:', error);
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
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
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
        {setSidebarOpen && (
          <button
            onClick={() => setSidebarOpen(false)}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '4px',
              color: theme.colors.textMuted,
              transition: 'color 0.15s, background 0.15s',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.color = theme.colors.text;
              e.currentTarget.style.background = theme.colors.bgTertiary;
            }}
            onMouseLeave={e => {
              e.currentTarget.style.color = theme.colors.textMuted;
              e.currentTarget.style.background = 'none';
            }}
            title="Close sidebar"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
              <line x1="4" y1="4" x2="12" y2="12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              <line x1="12" y1="4" x2="4" y2="12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        )}
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
              <span style={{ display: 'flex', flexShrink: 0, width: '16px', height: '16px' }}>
                {view.icon(localView === view.id ? theme.colors.text : theme.colors.textMuted)}
              </span>
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

        {/* Terminal button - positioned below workspace list */}
        <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: `1px solid ${theme.colors.border}` }}>
          {onCreateTerminal && (
            <button
              onClick={onCreateTerminal}
              style={{
                width: '100%',
                background: theme.colors.accent,
                color: '#fff',
                border: 'none',
                borderRadius: '4px',
                padding: '6px 12px',
                fontSize: '12px',
                fontWeight: 500,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                transition: 'opacity 0.15s',
              }}
              onMouseEnter={e => e.currentTarget.style.opacity = '0.85'}
              onMouseLeave={e => e.currentTarget.style.opacity = '1'}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <rect x="1" y="1" width="10" height="8" rx="1" stroke="currentColor" strokeWidth="1.2" />
                <polyline points="3,5 5,7 9,3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              + Terminal
            </button>
          )}
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
