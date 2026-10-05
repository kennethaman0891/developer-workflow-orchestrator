'use client';

import { useState, useEffect, type ReactNode } from 'react';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { isTauri } from '@/lib/tauri';

type ViewId = 'workspace' | 'projects' | 'ide' | 'collaboration' | 'settings';

interface SidebarProps {
  workspaces?: any[];
  activeId?: string;
  setMainView?: (view: string) => void;
  currentView?: string;
  onCreateTerminal?: () => void;
  onOpenWizard?: () => void;
  onCloseWorkspace?: (id: string) => void;
  onActivateWorkspace?: (id: string) => void;
  onOpenHandoff?: () => void;
  sidebarOpen?: boolean;
  onSidebarToggle?: () => void;
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
  onClose,
}: {
  ws: any;
  isActive: boolean;
  onClick: () => void;
  onClose?: () => void;
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
      {/* Close button - shown on hover */}
      {onClose && (
        <div
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = 'var(--dwo-color-error, #ef4444)';
              e.currentTarget.style.background = '#ef444418';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = 'var(--dwo-color-text-muted, #888)';
              e.currentTarget.style.background = 'transparent';
            }}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '18px',
            height: '18px',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            color: 'var(--dwo-color-text-muted, #888)',
            background: 'transparent',
            transition: 'color 0.12s, background 0.12s',
            flexShrink: 0,
            opacity: hovered ? 1 : 0,
          }}
          title="Close workspace"
        >
          <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <line x1="4" y1="4" x2="12" y2="12" />
            <line x1="12" y1="4" x2="4" y2="12" />
          </svg>
        </div>
      )}
    </button>
  );
}

export function Sidebar({
  workspaces = [],
  activeId = '',
  setMainView,
  currentView = 'workspace',
  onCreateTerminal,
  onOpenWizard,
  onCloseWorkspace,
  onActivateWorkspace,
  onOpenHandoff,
  sidebarOpen = true,
  onSidebarToggle,
}: SidebarProps) {
  const { theme } = useTheme();
  const { currentUser, signOut } = useAuth();
  const [newWsName, setNewWsName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [localView, setLocalView] = useState(currentView);
  // Detect Tauri mode after mount. We deliberately do NOT read isTauri()
  // during render (unlike the previous `useState(() => isTauri())` approach)
  // because isTauri() returns false on the server (no `window`) and true in
  // Tauri — that desync causes a hydration mismatch (server HTML ≠ client
  // HTML). Starting with `false` keeps the initial tree identical on both
  // sides. The handoff button area is always rendered (with an invisible
  // placeholder when not in Tauri mode) so the DOM structure never changes
  // across the server/client boundary, and the placeholder keeps the layout
  // stable so the one-time reveal after mount doesn't shift the sidebar.
  const [tauriMode, setTauriMode] = useState(false);
  useEffect(() => {
    if (isTauri()) setTauriMode(true);
  }, []);

  // Sync local nav highlight when the parent changes the real view
  useEffect(() => {
    setLocalView(currentView);
  }, [currentView]);

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
      onOpenWizard?.();
      setNewWsName('');
      setIsCreating(false);
    } catch (error) {
      console.error('Failed to create workspace:', error);
      setIsCreating(false);
    }
  };

  const handlePickFolder = () => {
    onOpenWizard?.();
  };

  const handleViewChange = (viewId: string) => {
    setLocalView(viewId);
    setMainView?.(viewId);
  };

  return (
    <aside
      style={{
        width: '240px',
        // Fill the flex row (100vh shell minus the 44px top strip), never
        // demand a full viewport height — minHeight:100vh clipped the footer
        // by exactly the strip height with overflow:hidden giving no escape.
        height: '100%',
        minHeight: 0,
        alignSelf: 'stretch',
        background: 'var(--dwo-color-bg-secondary)',
        borderRight: `1px solid ${'var(--dwo-color-border)'}`,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        flexShrink: 0,
      }}
    >
      {/* Logo & Title + Sidebar Toggle */}
      <div
        style={{
          padding: '14px 16px',
          borderBottom: `1px solid ${'var(--dwo-color-border)'}`,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          gap: '8px',
          flexShrink: 0,
        }}
      >
        {/* Row 1: Logo + Sidebar Toggle (inline) */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
          <img
            src="/logo.png"
            alt="DWO"
            style={{
              height: '36px',
              width: 'auto',
              maxHeight: '48px',
              maxWidth: '100%',
              borderRadius: '4px',
              objectFit: 'contain',
            }}
            onError={(e) => {
              e.currentTarget.style.display = 'none';
            }}
          />
          {/* Sidebar close button (hamburger/X) - inside sidebar */}
          <button
            onClick={() => onSidebarToggle?.()}
            style={{
              width: '32px',
              height: '32px',
              background: 'transparent',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--dwo-color-text-muted)',
              transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
              opacity: 0.7,
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'var(--dwo-color-bg-tertiary)';
              e.currentTarget.style.opacity = '1';
              e.currentTarget.style.color = 'var(--dwo-color-text)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.opacity = '0.7';
              e.currentTarget.style.color = 'var(--dwo-color-text-muted)';
            }}
            title={sidebarOpen ? 'Close sidebar' : 'Open sidebar'}
          >
            {sidebarOpen ? (
              // Close icon (X)
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                <line x1="4" y1="4" x2="12" y2="12" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
                <line x1="12" y1="4" x2="4" y2="12" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
              </svg>
            ) : (
              // Hamburger icon (☰)
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="2" y="3" width="12" height="1.5" rx="0.75" fill="currentColor" />
                <rect x="2" y="7.25" width="12" height="1.5" rx="0.75" fill="currentColor" />
                <rect x="2" y="11" width="12" height="1.5" rx="0.75" fill="currentColor" />
              </svg>
            )}
          </button>
        </div>

        {/* Row 2: Name / Title */}
        <div
          style={{
            fontSize: '13px',
            fontWeight: 700,
            color: 'var(--dwo-color-text)',
            letterSpacing: '0.02em',
            lineHeight: 1.2,
            display: 'flex',
            alignItems: 'baseline',
            gap: '5px',
          }}
        >
          <span>DWO</span>
          <span style={{ fontSize: '10px', fontWeight: 400, color: 'var(--dwo-color-text-muted)', letterSpacing: '0.01em' }}>
            Developer Workflow
          </span>
        </div>
      </div>

      {/* Navigation */}
      <div
        style={{
          padding: '10px 8px',
          borderBottom: `1px solid ${'var(--dwo-color-border)'}`,
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          {[
            { id: 'workspace' as ViewId, label: 'Workspace' },
            { id: 'projects' as ViewId, label: 'Projects' },
            { id: 'ide' as ViewId, label: 'IDE' },
            { id: 'collaboration' as ViewId, label: 'Collab' },
            { id: 'settings' as ViewId, label: 'Settings' },
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
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ flexShrink: 0, opacity: localView === view.id ? 1 : 0.7 }}
              >
                {view.id === 'workspace' && (
                  <>
                    <rect x="2" y="3" width="12" height="8" rx="1.5" />
                    <line x1="5" y1="14" x2="11" y2="14" />
                    <line x1="8" y1="12" x2="8" y2="14" />
                  </>
                )}
                {view.id === 'projects' && (
                  <path d="M2 4a1 1 0 011-1h3l1 1h6a1 1 0 011 1v7a1 1 0 01-1 1H3a1 1 0 01-1-1V4z" />
                )}
                {view.id === 'ide' && (
                  <>
                    <path d="M14 3L3 14l-1 4 4-1 11-11z" />
                    <line x1="10" y1="7" x2="7" y2="10" />
                  </>
                )}
                {view.id === 'collaboration' && (
                  <>
                    <circle cx="5.5" cy="4.5" r="2" />
                    <circle cx="10.5" cy="4.5" r="1.8" />
                    <path d="M1.5 13c0-2 1.5-3.5 4-3.5s4 1.5 4 3.5" />
                    <path d="M9.5 8.5c2 0 3.5 1.5 3.5 3.5" />
                  </>
                )}
                {view.id === 'settings' && (
                  <>
                    <circle cx="8" cy="8" r="2.5" />
                    <line x1="8" y1="1.5" x2="8" y2="3.5" />
                    <line x1="8" y1="12.5" x2="8" y2="14.5" />
                    <line x1="1.5" y1="8" x2="3.5" y2="8" />
                    <line x1="12.5" y1="8" x2="14.5" y2="8" />
                    <line x1="6" y1="6" x2="5" y2="5" />
                    <line x1="10" y1="10" x2="11" y2="11" />
                    <line x1="6" y1="10" x2="5" y2="11" />
                    <line x1="10" y1="6" x2="11" y2="5" />
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
                color: 'var(--dwo-color-text-muted)',
                opacity: isCreating ? 0.4 : 0.6,
                transition: 'opacity 0.12s, color 0.12s',
                display: 'flex',
                alignItems: 'center',
              }}
              title="Open folder"
              onMouseEnter={(e) => {
                if (!isCreating) {
                  e.currentTarget.style.color = 'var(--dwo-color-text)';
                  e.currentTarget.style.opacity = '1';
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = 'var(--dwo-color-text-muted)';
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
                color: 'var(--dwo-color-accent)',
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
                  e.currentTarget.style.background = `${'var(--dwo-color-accent)'}18`;
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
                  background: 'var(--dwo-color-bg)',
                  border: `1px solid ${'var(--dwo-color-border)'}`,
                  color: 'var(--dwo-color-text)',
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
                  background: newWsName.trim() ? 'var(--dwo-color-accent)' : 'var(--dwo-color-bg-tertiary)',
                  color: newWsName.trim() ? '#fff' : 'var(--dwo-color-text-muted)',
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
                  onActivateWorkspace?.(ws.id);
                  setMainView?.('workspace');
                }}
                onClose={() => onCloseWorkspace?.(ws.id)}
              />
            </div>
          ))}
        </div>

        {/* Terminal button */}
        {onCreateTerminal && (
          <div
            style={{
              padding: '8px 12px 4px',
              borderTop: `1px solid ${'var(--dwo-color-border)'}`,
              marginTop: '4px',
              flexShrink: 0,
            }}
          >
            <button
              onClick={onCreateTerminal}
              style={{
                width: '100%',
                background: 'var(--dwo-color-accent)',
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

        {/* Session Handoff button — always mounted for hydration safety;
            invisible placeholder keeps layout stable across the tauri-mode
            detection so the one-time reveal after mount doesn't shift the
            sidebar contents. */}
        <div style={{ padding: '4px 12px 8px', flexShrink: 0, minHeight: '36px' }}>
          {tauriMode && onOpenHandoff ? (
            <button
              onClick={onOpenHandoff}
              title="Open Session Handoff"
              style={{
                width: '100%',
                background: '#fbbf2418',
                border: '1px solid #fbbf2455',
                color: '#fbbf24',
                borderRadius: '6px',
                padding: '7px 12px',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '7px',
                letterSpacing: '0.01em',
                fontFamily: 'inherit',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = '#fbbf2433'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = '#fbbf2418'; }}
            >
              ⚡ Session Handoff
            </button>
          ) : (
            <span style={{ visibility: 'hidden' }}>⚡ Session Handoff</span>
          )}
        </div>
      </div>

      {/* Footer */}
      <div
        style={{
          padding: '10px 14px',
          borderTop: `1px solid ${'var(--dwo-color-border)'}`,
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
                  color: 'var(--dwo-color-text)',
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
                  color: 'var(--dwo-color-text-muted)',
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
                color: 'var(--dwo-color-text-muted)',
                padding: '4px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '5px',
                transition: 'color 0.12s, background 0.12s',
                flexShrink: 0,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = 'var(--dwo-color-error)';
                e.currentTarget.style.background = `${'var(--dwo-color-error)'}1a`;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = 'var(--dwo-color-text-muted)';
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
              color: 'var(--dwo-color-text-muted)',
              marginBottom: '6px',
              padding: '4px 6px',
              background: 'var(--dwo-color-bg-tertiary)',
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
            color: 'var(--dwo-color-text-muted)',
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
