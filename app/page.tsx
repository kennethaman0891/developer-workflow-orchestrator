'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
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
import { WizardView } from '@/components/workspace/WizardView';
import { terminalCreate } from '@/lib/terminal';
import { isTauri } from '@/lib/tauri';

type MainView = 'projects' | 'workspace' | 'grid' | 'ide' | 'collaboration' | 'settings';

function AppShell() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mainView, setMainView] = useState<MainView>('workspace');
  const [showWizard, setShowWizard] = useState(false);

  const {
    workspaces,
    activeId,
    create: createWs,
    update: updateWs,
    getLaunchCwd,
    activate: activateWs,
    load: loadWorkspaces,
  } = useWorkspaces();
  const { sessions, create: createTerminal, close: closeTerminal, list: listTerminals } = useTerminals();

  // Get the active workspace object
  const activeWorkspace = activeId ? workspaces.find(w => w.id === activeId) : null;

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

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
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
            <IDEView
              activeWorkspace={activeWorkspace || undefined}
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