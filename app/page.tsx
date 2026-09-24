'use client';

import { useState, useCallback, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Sidebar } from '@/components/shell/Sidebar';
import { TerminalPool } from '@/components/terminal/TerminalPool';
import { useTerminals } from '@/hooks/useTerminals';
import { ProjectsView } from '@/components/projects/ProjectsView';
import { CollaborationPanel } from '@/components/collaboration/CollaborationPanel';
import { SettingsPanel } from '@/components/settings/SettingsPanel';
import { ErrorReporter } from '@/components/diagnostics/ErrorReporter';
import { IDEView } from '@/views/ide/IDEView';
import { useWorkspaces } from '@/hooks/useWorkspaces';
import { SettingsProvider } from '@/contexts/SettingsContext';
import { ThemeProvider } from '@/contexts/ThemeContext';

type MainView = 'projects' | 'workspace' | 'grid' | 'ide' | 'collaboration' | 'settings';

function AppShell() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mainView, setMainView] = useState<MainView>('workspace');

  const { workspaces, activeId, create: createWs, selectFolder, activate: activateWs } = useWorkspaces();
  const { sessions, create: createTerminal, close: closeTerminal, defaultShell } = useTerminals();

  // Create initial terminal once on first render
  useEffect(() => {
    if (sessions.length === 0) {
      createTerminal(defaultShell).catch(console.error);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div style={{
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      background: 'var(--dwo-color-bg, #0a0a0a)',
      color: 'var(--dwo-color-text, #e8e8e8)',
      fontFamily: 'var(--dwo-font-sans, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif)',
      overflow: 'hidden',
      transition: 'background 0.2s, color 0.2s',
    }}>
      {/* Phase 5: Diagnostics/Error Reporting */}
      <ErrorReporter />
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Left sidebar */}
        {sidebarOpen && (
          <Sidebar
            workspaces={workspaces}
            activeId={activeId || ''}
            setSidebarOpen={setSidebarOpen}
            setMainView={(v: string) => setMainView(v as MainView)}
            currentView={mainView}
            onCreateTerminal={() => createTerminal(defaultShell)}
          />
        )}

        {/* Sidebar toggle trigger — shown when sidebar is closed */}
        {!sidebarOpen && (
          <button
            onClick={() => setSidebarOpen(true)}
            style={{
              width: '24px',
              height: '48px',
              background: 'var(--dwo-color-bg-secondary, #111111)',
              border: 'none',
              borderLeft: '1px solid var(--dwo-color-border, #2a2a2a)',
              borderRight: '1px solid var(--dwo-color-border, #2a2a2a)',
              borderRadius: '0 6px 6px 0',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--dwo-color-text-muted, #888888)',
              transition: 'background 0.15s, color 0.15s',
              position: 'relative',
              zIndex: 10,
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'var(--dwo-color-bg-tertiary, #1a1a1a)';
              e.currentTarget.style.color = 'var(--dwo-color-text, #e8e8e8)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'var(--dwo-color-bg-secondary, #111111)';
              e.currentTarget.style.color = 'var(--dwo-color-text-muted, #888888)';
            }}
            title="Open sidebar"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
              <line x1="2" y1="3" x2="12" y2="3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              <line x1="2" y1="7" x2="12" y2="7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              <line x1="2" y1="11" x2="12" y2="11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        )}

        {/* Main content area */}
        <main style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          minWidth: 0,
        }}>
          {/* Phase 1: Projects View */}
          {mainView === 'projects' && <ProjectsView />}

          {/* Phase 10: Collaboration View */}
          {mainView === 'collaboration' && <CollaborationPanel />}

          {/* Phase 6: Settings View */}
          {mainView === 'settings' && <SettingsPanel />}

          {/* Phase 0/1: Terminal Views — always mounted to preserve state across tab switches */}
          <div style={{
            display: (mainView === 'workspace' || mainView === 'grid') ? 'flex' : 'none',
            flex: 1,
            overflow: 'hidden',
          }}>
            <TerminalPool onCreateTerminal={() => createTerminal(defaultShell)} />
          </div>

          {/* Phase 7: IDE View */}
          {mainView === 'ide' && (
            <IDEView
              activeWorkspace={activeId ? workspaces.find(w => w.id === activeId) : undefined}
            />
          )}
        </main>
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <ThemeProvider>
      <SettingsProvider>
        <AppShell />
      </SettingsProvider>
    </ThemeProvider>
  );
}
