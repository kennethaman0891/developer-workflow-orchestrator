'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { Sidebar } from '@/components/shell/Sidebar';
import { TerminalPool } from '@/components/terminal/TerminalPool';
import { useTerminals } from '@/hooks/useTerminals';
import { ProjectsView } from '@/components/projects/ProjectsView';
import { CollaborationPanel } from '@/components/collaboration/CollaborationPanel';
import { SettingsPanel } from '@/components/settings/SettingsPanel';
import { ErrorReporter } from '@/components/diagnostics/ErrorReporter';
import { ErrorBoundary } from '@/components/diagnostics/ErrorBoundary';
import { IDEView } from '@/views/ide/IDEView';
import { useWorkspaces } from '@/contexts/WorkspacesContext';
import { WorkspacesProvider } from '@/contexts/WorkspacesContext';
import { SettingsProvider } from '@/contexts/SettingsContext';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { WizardView } from '@/components/workspace/WizardView';
import { terminalCreate } from '@/lib/terminal';
import { isTauri } from '@/lib/tauri';

type MainView = 'projects' | 'workspace' | 'grid' | 'ide' | 'collaboration' | 'settings';

function AppShell() {
  // Persist sidebar open/closed state across sessions via localStorage
  const getInitialSidebarOpen = (): boolean => {
    try {
      const saved = localStorage.getItem('dwo-sidebar-open');
      if (saved !== null) return saved === 'true';
    } catch {}
    return true; // default: sidebar open on first visit
  };
  const [sidebarOpen, setSidebarOpen] = useState(getInitialSidebarOpen);
  const [mainView, setMainView] = useState<MainView>('workspace');
  const [showWizard, setShowWizard] = useState(false);

  // Persist sidebar state whenever it changes
  useEffect(() => {
    try {
      localStorage.setItem('dwo-sidebar-open', String(sidebarOpen));
    } catch {}
  }, [sidebarOpen]);

  const {
    workspaces,
    activeId,
    create: createWs,
    update: updateWs,
    getLaunchCwd,
    activate: activateWs,
    load: loadWorkspaces,
    close: closeWs,
  } = useWorkspaces();
  const { sessions, create: createTerminal, close: closeTerminal, list: listTerminals } = useTerminals();

  // Get the active workspace object
  const activeWorkspace = activeId ? workspaces.find(w => w.id === activeId) : null;

  // ── Workspace close with terminal cleanup ────────────────────────────────────
  const handleCloseWorkspace = useCallback(async (id: string) => {
    // Close all terminals bound to this workspace
    const current = await listTerminals();
    const boundSessions = current.filter(s => s.workspace_id === id);
    await Promise.all(boundSessions.map(s => closeTerminal(s.id)));

    // Remove from deleted-set so it can be recreated later
    createdForRef.current.delete(id);

    // Delete the workspace itself
    await closeWs(id);

    // If we just deleted the active workspace, create a fresh default
    if (activeId === id) {
      const remaining = workspaces.filter(w => w.id !== id);
      if (remaining.length === 0) {
        await createWs('Workspace');
      } else {
        await activateWs(remaining[0].id);
      }
    }
  }, [closeWs, createWs, activateWs, activeId, workspaces, listTerminals, closeTerminal]);

  // ── Terminal creation for the active workspace ─────────────────────────────
  // Creates a terminal bound to the workspace's project path + id.
  const createTerminalForWorkspace = useCallback(async (): Promise<string | null> => {
    const cwd = activeWorkspace?.path || undefined;
    const wsId = activeWorkspace?.id || undefined;
    const id = await terminalCreate({ cwd, workspaceId: wsId });
    if (id) {
      await listTerminals();
    }
    return id;
  }, [activeWorkspace?.path, activeWorkspace?.id, listTerminals]);

  // ── App open: hydrate state, handle launch-cwd, auto-create default ────────
  // NOTE: `loadWorkspaces()` returns the fresh list — do NOT read `workspaces`
  // from the closure here; it is stale at mount time.
  const didInitRef = useRef(false);
  useEffect(() => {
    if (didInitRef.current) return;
    didInitRef.current = true;

    const init = async () => {
      // Skip backend-dependent init when running outside Tauri (web/Docker mode)
      if (!isTauri()) return;

      const wsList = await loadWorkspaces();

      // Check if we were launched from the CLI (scripts/dwo wrote launch-cwd)
      const launchCwd = await getLaunchCwd();

      if (launchCwd) {
        // Find a workspace without a path and fill it in
        const pathlessWs = wsList.find(w => !w.path);
        if (pathlessWs) {
          await updateWs(pathlessWs.id, { path: launchCwd });
        } else if (wsList.length === 0) {
          // No workspaces at all — create one bound to the launch dir
          const name = launchCwd.split('/').filter(Boolean).pop() || 'Workspace';
          await createWs(name, launchCwd);
        }
      } else if (wsList.length === 0) {
        // No launch-cwd and no workspaces — create a default
        await createWs('Workspace');
      }
    };
    init().catch(console.error);
  }, [loadWorkspaces, updateWs, createWs, getLaunchCwd]);

  // ── Ensure at least one terminal exists when a workspace is active ─────────
  // Created immediately — no delay, no stale-closure issues.
  const createdForRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!activeId || !activeWorkspace?.path) return;
    if (createdForRef.current.has(activeId)) return;
    createdForRef.current.add(activeId);
    (async () => {
      const current = await listTerminals();
      const bound = current.some(s => s.workspace_id === activeId);
      if (!bound) {
        const cwd = activeWorkspace.path ?? undefined;
        const wsId = activeWorkspace.id;
        const id = await terminalCreate({ cwd, workspaceId: wsId });
        if (id) {
          await listTerminals();
        }
      }
    })().catch(console.error);
  }, [activeId, activeWorkspace?.path, activeWorkspace?.id, listTerminals]);

  // Cmd+T → open wizard
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 't') {
        e.preventDefault();
        setShowWizard(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

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

      {/* New Workspace Wizard (Cmd+T) */}
      {showWizard && (
        <WizardView onClose={() => setShowWizard(false)} />
      )}

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', position: 'relative' }}>
        {/* Left sidebar */}
        {sidebarOpen && (
          <Sidebar
            workspaces={workspaces}
            activeId={activeId || ''}
            setSidebarOpen={setSidebarOpen}
            setMainView={(v: string) => setMainView(v as MainView)}
            currentView={mainView}
            onCreateTerminal={createTerminalForWorkspace}
            onOpenWizard={() => setShowWizard(true)}
            onCloseWorkspace={handleCloseWorkspace}
            onActivateWorkspace={activateWs}
          />
        )}

        {/* Sidebar toggle — always in DOM so it never disappears due to re-renders */}
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          style={{
            position: 'absolute',
            left: 0,
            top: '50%',
            transform: 'translateY(-50%)',
            width: '28px',
            height: '56px',
            background: '#111111',
            border: 'none',
            borderLeft: '1px solid #2a2a2a',
            borderRight: '1px solid #2a2a2a',
            borderRadius: '0 8px 8px 0',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#888888',
            transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
            zIndex: 100,
            boxShadow: '2px 0 8px rgba(0,0,0,0.3)',
            opacity: sidebarOpen ? 0 : 1,
            pointerEvents: sidebarOpen ? 'none' : 'auto',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = '#1a1a1a';
            e.currentTarget.style.color = '#e8e8e8';
            e.currentTarget.style.width = '32px';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = '#111111';
            e.currentTarget.style.color = '#888888';
            e.currentTarget.style.width = '28px';
          }}
          title="Toggle sidebar"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="2" y="3" width="12" height="1.5" rx="0.75" fill="currentColor" />
            <rect x="2" y="7.25" width="12" height="1.5" rx="0.75" fill="currentColor" />
            <rect x="2" y="11" width="12" height="1.5" rx="0.75" fill="currentColor" />
          </svg>
        </button>

        {/* Main content area */}
        <main style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          minWidth: 0,
        }}>
          {/* Phase 1: Projects View */}
          {mainView === 'projects' && (
            <ProjectsView
              onContinue={(id) => {
                activateWs(id);
                setMainView('workspace');
              }}
              onDeleteWorkspace={handleCloseWorkspace}
            />
          )}

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
            <TerminalPool
              sessions={sessions}
              layoutKey={activeId ? `dwo-layout-${activeId}` : undefined}
              onCreateTerminal={createTerminalForWorkspace}
              onCloseSession={(id) => closeTerminal(id)}
              autoLaunchCommand={activeWorkspace?.command}
              autoLaunchEnabled={true}
            />
          </div>

          {/* Phase 7: IDE View */}
          {mainView === 'ide' && (
            <ErrorBoundary label="IDE">
              <IDEView initialPath={activeWorkspace?.path || undefined} />
            </ErrorBoundary>
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
        <WorkspacesProvider>
          <AppShell />
        </WorkspacesProvider>
      </SettingsProvider>
    </ThemeProvider>
  );
}