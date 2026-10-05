'use client';

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
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
import { WizardView } from '@/components/workspace/WizardView';
import { HandoffPanel } from '@/components/handoff/HandoffPanel';
import { terminalCreate } from '@/lib/terminal';
import { isTauri } from '@/lib/tauri';

type MainView = 'projects' | 'workspace' | 'grid' | 'ide' | 'collaboration' | 'settings';

function AppShell() {
  // Sidebar open/closed state — default open on first visit. The initializer
  // stays SSR-safe (a constant); the persisted value hydrates after mount so
  // the server-rendered tree matches the client's first render.
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mainView, setMainView] = useState<MainView>('workspace');
  const [showWizard, setShowWizard] = useState(false);
  const [handoffOpen, setHandoffOpen] = useState(false);
  const [activeTerminalId, setActiveTerminalId] = useState<string | null>(null);

  // Hydrate persisted sidebar state post-mount (see note above)
  useEffect(() => {
    try {
      const saved = localStorage.getItem('dwo-sidebar-open');
      if (saved !== null) setSidebarOpen(saved === 'true');
    } catch {}
  }, []);

  // Persist sidebar state whenever it changes — skipping the pre-hydration
  // mount save so a stored "closed" state can't be clobbered by the default.
  const firstSidebarPersistRef = useRef(true);
  useEffect(() => {
    if (firstSidebarPersistRef.current) {
      firstSidebarPersistRef.current = false;
      return;
    }
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
  const { sessions, create: createTerminal, close: closeTerminal, list: listTerminals, error: terminalError, clearError: clearTerminalError } = useTerminals();

  // Get the active workspace object
  const activeWorkspace = activeId ? workspaces.find(w => w.id === activeId) : null;

  // Active workspace's sessions (falls back to all if none explicitly bound)
  const activeSessions = useMemo(() => {
    if (!activeId) return sessions;
    const bound = sessions.filter(s => s.workspace_id === activeId);
    return bound.length > 0 ? bound : sessions;
  }, [sessions, activeId]);

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
    try {
      // Routed through the hook (not the raw lib call) so failures land in
      // the shared error state and render as a banner instead of a dead button.
      return await createTerminal(cwd, wsId);
    } catch {
      return null;
    }
  }, [activeWorkspace?.path, activeWorkspace?.id, createTerminal]);

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

  // ── Ensure template terminal count exists when a workspace is active ───────
  // Created immediately — no delay, no stale-closure issues.
  const createdForRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!activeId || !activeWorkspace?.path) return;
    if (createdForRef.current.has(activeId)) return;
    createdForRef.current.add(activeId);
    (async () => {
      const current = await listTerminals();
      const bound = current.filter(s => s.workspace_id === activeId);
      const targetCount = activeWorkspace.template && activeWorkspace.template > 0 ? activeWorkspace.template : 1;
      const needed = targetCount - bound.length;
      if (needed > 0) {
        const cwd = activeWorkspace.path ?? undefined;
        const wsId = activeWorkspace.id;
        for (let i = 0; i < needed; i++) {
          await terminalCreate({ cwd, workspaceId: wsId });
        }
        await listTerminals();
      }
    })().catch(console.error);
  }, [activeId, activeWorkspace?.path, activeWorkspace?.id, activeWorkspace?.template, listTerminals]);

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
    <>
    <div
      data-dwo-root=""
      style={{
        height: '100vh',
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--dwo-color-bg, #1e1e1e)',
        color: 'var(--dwo-color-text, #f8f8f2)',
        fontFamily: 'var(--dwo-font-sans, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif)',
        overflow: 'hidden',
        transition: 'background 0.2s, color 0.2s',
      }}
    >
      {/* Top strip — holds the sidebar toggle IN-FLOW so it can never
          overlap sidebar or terminal content (replaces the old fixed button) */}
      <div style={{
        height: '44px',
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        paddingLeft: '12px',
        background: 'var(--dwo-color-bg, #0a0a0a)',
        borderBottom: '1px solid #1a1a1a',
      }}>
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          style={{ width: '36px',
            height: '36px',
            background: 'var(--dwo-color-bg, #0a0a0a)',
            border: 'none',
            borderBottom: '1px solid var(--dwo-color-border, #1a1a1a)',
            borderRight: '1px solid var(--dwo-color-border, #1a1a1a)',
            borderRadius: '0 0 8px 0',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: sidebarOpen ? 'var(--dwo-color-text-muted, #888)' : 'var(--dwo-color-accent, #4a9eff)',
            transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
            opacity: 0.8, }}
          title={sidebarOpen ? 'Close sidebar' : 'Open sidebar'}
        >
          {sidebarOpen ? (
            // Close icon (X)
            <svg width="18" height="18" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
              <line x1="4" y1="4" x2="12" y2="12" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
              <line x1="12" y1="4" x2="4" y2="12" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
            </svg>
          ) : (
            // Hamburger icon (☰)
            <svg width="18" height="18" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="2" y="3" width="12" height="1.5" rx="0.75" fill="currentColor" />
              <rect x="2" y="7.25" width="12" height="1.5" rx="0.75" fill="currentColor" />
              <rect x="2" y="11" width="12" height="1.5" rx="0.75" fill="currentColor" />
            </svg>
          )}
        </button>
      </div>

      {/* Phase 5: Diagnostics/Error Reporting */}
      <ErrorBoundary label="Diagnostics">
        <ErrorReporter />
      </ErrorBoundary>

      {/* New Workspace Wizard (Cmd+T) */}
      {showWizard && (
        <ErrorBoundary label="Workspace wizard">
          <WizardView
            onClose={() => setShowWizard(false)}
            onCreated={() => setMainView('workspace')}
          />
        </ErrorBoundary>
      )}

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', position: 'relative', minHeight: 0 }}>
        {/* Sidebar wrapper — always mounted so the flex row never reflows.
            When closed the wrapper collapses to 0 px via CSS transition; the
            Sidebar stays in the DOM underneath so the WebView flex layout
            distributes width to <main> instantly, avoiding the ghost gap that
            appeared when the sidebar was conditionally unmounted. */}
        <div
          style={{
            width: sidebarOpen ? '240px' : '0',
            minWidth: sidebarOpen ? '240px' : '0',
            maxWidth: sidebarOpen ? '240px' : '0',
            overflow: 'hidden',
            flexShrink: 0,
            transition:
              'width 0.2s cubic-bezier(0.4,0,0.2,1), min-width 0.2s cubic-bezier(0.4,0,0.2,1), max-width 0.2s cubic-bezier(0.4,0,0.2,1)',
          }}
        >
          <ErrorBoundary label="Sidebar">
            <Sidebar
              workspaces={workspaces}
              activeId={activeId || ''}
              setMainView={(v: string) => setMainView(v as MainView)}
              currentView={mainView}
              onCreateTerminal={createTerminalForWorkspace}
              onOpenWizard={() => setShowWizard(true)}
              onCloseWorkspace={handleCloseWorkspace}
              onActivateWorkspace={activateWs}
              onOpenHandoff={() => setHandoffOpen(true)}
              sidebarOpen={sidebarOpen}
              onSidebarToggle={() => setSidebarOpen((open) => !open)}
            />
          </ErrorBoundary>
        </div>

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
            <ErrorBoundary label="Projects">
              <ProjectsView
                onContinue={(id) => {
                  activateWs(id);
                  setMainView('workspace');
                }}
                onDeleteWorkspace={handleCloseWorkspace}
              />
            </ErrorBoundary>
          )}

          {/* Phase 10: Collaboration View */}
          {mainView === 'collaboration' && (
            <ErrorBoundary label="Collaboration">
              <CollaborationPanel />
            </ErrorBoundary>
          )}

          {/* Phase 6: Settings View */}
          {mainView === 'settings' && (
            <ErrorBoundary label="Settings">
              <SettingsPanel />
            </ErrorBoundary>
          )}

          {/* Phase 0/1: Terminal Views — always mounted to preserve state across tab switches */}
          <div
            style={{
              display: mainView === 'workspace' || mainView === 'grid' ? 'flex' : 'none',
              flex: 1,
              overflow: 'hidden',
            }}
          >
            <ErrorBoundary label="Terminals">
              <TerminalPool
                sessions={activeSessions}
                layoutKey={activeId ? `dwo-layout-${activeId}` : undefined}
                onCreateTerminal={createTerminalForWorkspace}
                onCloseSession={(id) => closeTerminal(id)}
                autoLaunchCommand={activeWorkspace?.command}
                autoLaunchEnabled={true}
                onAutoLaunched={() => {
                  void listTerminals();
                }}
                onActiveSessionChange={setActiveTerminalId}
                backendError={terminalError}
                onClearBackendError={clearTerminalError}
              />
            </ErrorBoundary>
          </div>

          {/* Phase 7: IDE View — kept mounted so tabs and editor state survive view switches */}
          <div style={{ display: mainView === 'ide' ? 'flex' : 'none', flex: 1, minHeight: 0, height: '100%', flexDirection: 'column' }}>
            <ErrorBoundary label="IDE">
              <IDEView initialPath={activeWorkspace?.path || undefined} />
            </ErrorBoundary>
          </div>
        </main>
      </div>
    </div>

    {/* Session handoff panel — app-level overlay, triggered from the sidebar */}
    {handoffOpen && (
      <ErrorBoundary label="Session handoff">
        <HandoffPanel
          sessions={sessions}
          activeId={activeTerminalId}
          onClose={() => setHandoffOpen(false)}
        />
      </ErrorBoundary>
    )}
  </>
  );
}

export default function Home() {
  return (
    <SettingsProvider>
      <WorkspacesProvider>
        <AppShell />
      </WorkspacesProvider>
    </SettingsProvider>
  );
}