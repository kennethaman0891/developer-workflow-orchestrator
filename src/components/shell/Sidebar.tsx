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
  onOpenWizard?: () => void;
}

const SECTION_LABEL_STYLE: React.CSSProperties = {
  fontSize: '10px',
  fontWeight: 600,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--dwo-color-text-muted, #888)',
  padding: '0 12px',
  marginBottom: '6px',
};

const NAV_ITEM_BASE: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  width: '100%',
  padding: '7px 10px',
  border: 'none',
  borderRadius: '6px',
  cursor: 'pointer',
  fontSize: '13px',
  fontWeight: 400,
  textAlign: 'left',
  color: 'var(--dwo-color-text-muted, #888)',
  background: 'transparent',
  transition: 'color 0.12s ease, background 0.12s ease',
};

const WS_ITEM_BASE: React.CSSProperties = {
  width: '100%',
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  padding: '7px 10px',
  border: 'none',
  borderRadius: '6px',
  cursor: 'pointer',
  fontSize: '13px',
  textAlign: 'left',
  color: 'var(--dwo-color-text-muted, #888)',
  background: 'transparent',
  transition: 'color 0.12s ease, background 0.12s ease',
};

function SectionHeader({ children }: { children: ReactNode }) {
  return (
    <div style={{ ...SECTION_LABEL_STYLE }}>{children}</div>
  );
}

function NavButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        ...NAV_ITEM_BASE,
        color: active
          ? 'var(--dwo-color-text, #e8e8e8)'
          : hovered
            ? 'var(--dwo-color-text, #e8e8e8)'
            : 'var(--dwo-color-text-muted, #888)',
        background: active
          ? 'var(--dwo-color-bg-tertiary, #1a1a1a)'
          : hovered
            ? 'var(--dwo-color-bg-tertiary, #1a1a1a)'
            : 'transparent',
      }}
    >
      {children}
    </button>
  );
}

function WorkspaceItem({
  ws,
  isActive,
  onClick,
}: {
  ws: any;
  isActive: boolean;
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        ...WS_ITEM_BASE,
        color: isActive
          ? 'var(--dwo-color-text, #e8e8e8)'
          : hovered
            ? 'var(--dwo-color-text, #e8e8e8)'
            : 'var(--dwo-color-text-muted, #888)',
        background: isActive
          ? 'var(--dwo-color-bg-tertiary, #1a1a1a)'
          : hovered
            ? 'var(--dwo-color-bg-tertiary, #1a1a1a)'
            : 'transparent',
      }}
    >
      {/* Active indicator line */}
      {isActive && (
        <span
          style={{
            position: 'absolute',
            left: 0,
            top: '50%',
            transform: 'translateY(-50%)',
            width: '3px',
            height: '20px',
            borderRadius: '0 2px 2px 0',
            background: 'var(--dwo-color-accent, #4a9eff)',
          }}
        />
      )}
      {/* Color dot */}
      {ws.color && (
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: ws.color,
            flexShrink: 0,
            opacity: 0.9,
          }}
        />
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontWeight: isActive ? 600 : 500,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            fontSize: '13px',
          }}
        >
          {ws.name}
        </div>
        {ws.path && (
          <div
            style={{
              fontSize: '11px',
              color: 'var(--dwo-color-text-muted, #888)',
              fontFamily: 'var(--dwo-font-mono, monospace)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              marginTop: '1px',
            }}
          >
            {ws.path.split('/').filter(Boolean).slice(-2).join('/')}
          </div>
        )}
      </div>
      {/* Template badge */}
      {ws.template && ws.template > 1 && (
        <span
          style={{
            fontSize: '10px',
            fontWeight: 500,
            color: 'var(--dwo-color-text-muted, #888)',
            background: 'var(--dwo-color-bg, #0a0a0a)',
            border: `1px solid var(--dwo-color-border, #2a2a2a)`,
            padding: '1px 5px',
            borderRadius: '4px',
            flexShrink: 0,
            lineHeight: '16px',
          }}
        >
          {ws.template}
        </span>
      )}
    </button>
  );
}

export function Sidebar({
  workspaces = [],
  activeId = '',
  setSidebarOpen,
  setMainView,
  currentView = 'workspace',
  onCreateTerminal,
  onOpenWizard,
}: SidebarProps) {
  const { theme } = useTheme();
  const { create: createWs, selectFolder, activate: activateWs } = useWorkspaces();
  const { currentUser, signOut } = useAuth();
  const [newWsName, setNewWsName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [localView, setLocalView] = useState(currentView);

  const handleNewWorkspace = () => {
    onOpenWizard?.();
  };

  const handleCreateWorkspace = async () => {
    if (!newWsName.trim()) {
      onOpenWizard?.();
      return;
    }
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

  const handlePickFolder = async () => {
    setIsCreating(true);
    try {
      const selectedPath = await selectFolder();
      if (selectedPath) {
        const folderName = selectedPath.split('/').filter(Boolean).pop() || 'Untitled';
        try {
          await createWs(folderName, selectedPath);
        } catch (error) {
          console.error('Failed to create workspace:', error);
        }
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

  return (
    <aside
      style={{
        width: '240px',
        minHeight: '100vh',
        background: theme.colors.bgSecondary,
        borderRight: `1px solid ${theme.colors.border}`,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        flexShrink: 0,
      }}
    >
      {/* Logo */}
      <div
        style={{
          padding: '14px 16px',
          borderBottom: `1px solid ${theme.colors.border}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
          <img
            src="/logo.png"
            alt="DWO"
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '6px',
              objectFit: 'contain',
            }}
            onError={(e) => {
              e.currentTarget.style.display = 'none';
            }}
          />
          <div>
            <div
              style={{
                fontSize: '13px',
                fontWeight: 700,
                color: theme.colors.text,
                letterSpacing: '0.02em',
                lineHeight: 1.2,
              }}
            >
              DWO
            </div>
            <div
              style={{
                fontSize: '10px',
                color: theme.colors.textMuted,
                letterSpacing: '0.01em',
                lineHeight: 1.2,
              }}
            >
              Developer Workflow
            </div>
          </div>
        </div>
        {setSidebarOpen && (
          <button
            onClick={() => setSidebarOpen(false)}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '5px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '5px',
              color: theme.colors.textMuted,
              transition: 'color 0.12s, background 0.12s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = theme.colors.text;
              e.currentTarget.style.background = theme.colors.bgTertiary;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = theme.colors.textMuted;
              e.currentTarget.style.background = 'none';
            }}
            title="Close sidebar"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <line x1="4" y1="4" x2="12" y2="12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              <line x1="12" y1="4" x2="4" y2="12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        )}
      </div>

      {/* Navigation */}
      <div
        style={{
          padding: '10px 8px',
          borderBottom: `1px solid ${theme.colors.border}`,
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          {[
            { id: 'workspace' as ViewId, label: 'Workspace', iconPath: 'M3 2l9 4v8H3V2zm0 0l6-3 6 3M3 2h10' },
            { id: 'projects' as ViewId, label: 'Projects', iconPath: 'M2 3h10l1 1v9H1V4l1-1z' },
            { id: 'ide' as ViewId, label: 'IDE', iconPath: 'M13.5 2.5l-9 9-3.5 1 1-3.5 9-9a1.06 1.06 0 011.5 1.5z' },
            { id: 'collaboration' as ViewId, label: 'Collab', iconPath: 'M12 5a2 2 0 11-4 0 2 2 0 014 0zM5 6a2 2 0 11-4 0 2 2 0 014 0zM12 13c-3 0-5-1.5-5-3s2-3 5-3' },
            { id: 'settings' as ViewId, label: 'Settings', iconPath: 'M8 2l1.5 1.5M13 8l-1.5 1M8 14l-1.5-1.5M5 8l1.5-1M8 2a6 6 0 016 6 6 6 0 01-6 6 6 6 0 01-6-6 6 6 0 016-6z' },
          ].map((view) => (
            <NavButton
              key={view.id}
              active={localView === view.id}
              onClick={() => handleViewChange(view.id)}
            >
              <svg
                width="15"
                height="15"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ flexShrink: 0, opacity: localView === view.id ? 1 : 0.7 }}
              >
                {view.id === 'workspace' && (
                  <>
                    <rect x="1" y="2" width="14" height="9" rx="1.5" />
                    <path d="M4 14h8" />
                    <path d="M8 11v3" />
                  </>
                )}
                {view.id === 'projects' && (
                  <path d="M1 4a1 1 0 011-1h3.5l1 1H14a1 1 0 011 1v7a1 1 0 01-1 1H2a1 1 0 01-1-1V4z" />
                )}
                {view.id === 'ide' && (
                  <>
                    <path d="M13.5 2.5l-9 9-3.5 1 1-3.5 9-9a1.06 1.06 0 011.5 1.5z" />
                    <path d="M10.5 5.5l2 2" />
                  </>
                )}
                {view.id === 'collaboration' && (
                  <>
                    <circle cx="6" cy="5" r="2.5" />
                    <circle cx="10" cy="5" r="2" />
                    <path d="M1 13c0-2.5 2-4.5 5-4.5s5 2 5 4.5" />
                    <path d="M11 9c2.5 0 4 1.5 4 4" />
                  </>
                )}
                {view.id === 'settings' && (
                  <>
                    <circle cx="8" cy="8" r="2.5" />
                    <path d="M13.5 8a5.5 5.5 0 01-.2 1.4l1.2.8-1 1.7-1.5-.6a5.5 5.5 0 01-1.2.7l-.2 1.4v1.8h-2l-.2-1.4a5.5 5.5 0 01-1.2-.7l-1.5.6-1-1.7 1.2-.8a5.5 5.5 0 01-.2-1.4 5.5 5.5 0 01.2-1.4l-1.2-.8 1-1.7 1.5.6a5.5 5.5 0 011.2-.7l.2-1.4V2h2l.2 1.4a5.5 5.5 0 011.2.7l1.5-.6 1 1.7-1.2.8c.1.5.2.9.2 1.4z" />
                  </>
                )}
              </svg>
              <span style={{ fontWeight: localView === view.id ? 500 : 400 }}>
                {view.label}
              </span>
            </NavButton>
          ))}
        </div>
      </div>

      {/* Workspaces */}
      <div
        style={{
          flex: 1,
          overflow: 'auto',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Section header + new button */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '14px 12px 6px',
            flexShrink: 0,
          }}
        >
          <SectionHeader>Workspaces</SectionHeader>
          <div style={{ display: 'flex', gap: '4px' }}>
            <button
              onClick={handlePickFolder}
              disabled={isCreating}
              style={{
                background: 'none',
                border: 'none',
                cursor: isCreating ? 'not-allowed' : 'pointer',
                padding: '4px 5px',
                borderRadius: '5px',
                color: theme.colors.textMuted,
                opacity: isCreating ? 0.4 : 0.6,
                transition: 'opacity 0.12s, color 0.12s',
                display: 'flex',
                alignItems: 'center',
              }}
              title="Open folder"
              onMouseEnter={(e) => {
                if (!isCreating) {
                  e.currentTarget.style.color = theme.colors.text;
                  e.currentTarget.style.opacity = '1';
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = theme.colors.textMuted;
                e.currentTarget.style.opacity = isCreating ? '0.4' : '0.6';
              }}
            >
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 10v3a1 1 0 01-1 1H3a1 1 0 01-1-1V5a1 1 0 011-1h3l1 1h6a1 1 0 011 1z" />
              </svg>
            </button>
            <button
              onClick={handleNewWorkspace}
              disabled={isCreating}
              style={{
                background: 'none',
                border: 'none',
                cursor: isCreating ? 'not-allowed' : 'pointer',
                padding: '4px 5px',
                borderRadius: '5px',
                color: theme.colors.accent,
                opacity: isCreating ? 0.4 : 0.8,
                transition: 'opacity 0.12s, background 0.12s',
                display: 'flex',
                alignItems: 'center',
                fontSize: '15px',
                lineHeight: 1,
              }}
              title="New workspace (⌘T)"
              onMouseEnter={(e) => {
                if (!isCreating) {
                  e.currentTarget.style.background = `${theme.colors.accent}18`;
                  e.currentTarget.style.opacity = '1';
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'none';
                e.currentTarget.style.opacity = isCreating ? '0.4' : '0.8';
              }}
            >
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <line x1="8" y1="3" x2="8" y2="13" />
                <line x1="3" y1="8" x2="13" y2="8" />
              </svg>
            </button>
          </div>
        </div>

        {/* Quick create input */}
        {isCreating && (
          <div style={{ padding: '4px 12px 8px', flexShrink: 0 }}>
            <div style={{ display: 'flex', gap: '6px' }}>
              <input
                type="text"
                value={newWsName}
                onChange={(e) => setNewWsName(e.target.value)}
                placeholder="Name…"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreateWorkspace();
                  if (e.key === 'Escape') setIsCreating(false);
                }}
                style={{
                  flex: 1,
                  background: theme.colors.bg,
                  border: `1px solid ${theme.colors.border}`,
                  color: theme.colors.text,
                  padding: '5px 8px',
                  borderRadius: '5px',
                  fontSize: '12px',
                  outline: 'none',
                  fontFamily: theme.fonts.sans,
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
                  padding: '5px 10px',
                  borderRadius: '5px',
                  cursor: newWsName.trim() ? 'pointer' : 'not-allowed',
                  fontSize: '12px',
                  fontWeight: 500,
                  fontFamily: theme.fonts.sans,
                  opacity: newWsName.trim() ? 1 : 0.5,
                }}
              >
                Create
              </button>
            </div>
          </div>
        )}

        {/* Workspace list */}
        <div style={{ padding: '4px 8px', display: 'flex', flexDirection: 'column', gap: '1px', flex: 1 }}>
          {workspaces.map((ws: any) => (
            <div key={ws.id} style={{ position: 'relative' }}>
              <WorkspaceItem
                ws={ws}
                isActive={ws.id === activeId}
                onClick={() => {
                  activateWs(ws.id);
                  setMainView?.('workspace');
                }}
              />
            </div>
          ))}
        </div>

        {/* Terminal button */}
        {onCreateTerminal && (
          <div
            style={{
              padding: '8px 12px 4px',
              borderTop: `1px solid ${theme.colors.border}`,
              marginTop: '4px',
              flexShrink: 0,
            }}
          >
            <button
              onClick={onCreateTerminal}
              style={{
                width: '100%',
                background: theme.colors.accent,
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                padding: '7px 12px',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '7px',
                transition: 'opacity 0.12s, transform 0.1s',
                fontFamily: theme.fonts.sans,
                letterSpacing: '0.01em',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.85')}
              onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
              onMouseDown={(e) => (e.currentTarget.style.transform = 'scale(0.98)')}
              onMouseUp={(e) => (e.currentTarget.style.transform = 'scale(1)')}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <rect x="1" y="1" width="10" height="8" rx="1" stroke="currentColor" strokeWidth="1.2" />
                <polyline points="3,5 5,7 9,3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              New Terminal
            </button>
          </div>
        )}
      </div>

      {/* Footer */}
      <div
        style={{
          padding: '10px 14px',
          borderTop: `1px solid ${theme.colors.border}`,
          flexShrink: 0,
        }}
      >
        {currentUser ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <img
              src={getUserAvatar(currentUser)}
              alt={currentUser.name}
              style={{
                width: '26px',
                height: '26px',
                borderRadius: '50%',
                objectFit: 'cover',
                flexShrink: 0,
              }}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: '12px',
                  color: theme.colors.text,
                  fontWeight: 500,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {currentUser.name}
              </div>
              <div
                style={{
                  fontSize: '10px',
                  color: theme.colors.textMuted,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
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
                borderRadius: '5px',
                transition: 'color 0.12s, background 0.12s',
                flexShrink: 0,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = theme.colors.error;
                e.currentTarget.style.background = `${theme.colors.error}1a`;
              }}
              onMouseLeave={(e) => {
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
          <div
            style={{
              fontSize: '10px',
              color: theme.colors.textMuted,
              marginBottom: '6px',
              padding: '4px 6px',
              background: theme.colors.bgTertiary,
              borderRadius: '4px',
              textAlign: 'center',
            }}
          >
            Not signed in
          </div>
        )}
        <div
          style={{
            fontSize: '10px',
            color: theme.colors.textMuted,
            textAlign: 'center',
            opacity: 0.6,
            lineHeight: 1.5,
          }}
        >
          Free tier · 4 terminals / 2 workspaces
          <br />
          DWO v2.0.0
        </div>
      </div>
    </aside>
  );
}

function getUserAvatar(user: { name: string; email: string; avatar: string }): string {
  const initials = user.name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);
  const colors = ['#4a9eff', '#f472b6', '#34d399', '#fbbf24', '#a78bfa'];
  const colorIndex = user.email.charCodeAt(0) % colors.length;
  return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" rx="8" fill="${colors[colorIndex]}"/><text x="50%" y="55%" dominant-baseline="middle" text-anchor="middle" font-family="sans-serif" font-size="16" font-weight="600" fill="white">${initials}</text></svg>`)}`;
}
