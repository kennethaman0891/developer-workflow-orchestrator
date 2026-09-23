'use client';

import { useState } from 'react';
import { Sidebar } from '@/components/shell/Sidebar';
import { TerminalPool } from '@/components/terminal/TerminalPool';
import { LicensePanel } from '@/components/license/LicensePanel';
import { ProjectsView } from '@/components/projects/ProjectsView';
import { GitPanel } from '@/components/git/GitPanel';
import { TaskAutomation } from '@/components/tasks/TaskAutomation';
import { CollaborationPanel } from '@/components/collaboration/CollaborationPanel';
import { PluginManager } from '@/components/plugins/PluginManager';
import { DistributionPanel } from '@/components/distribution/DistributionPanel';
import { SettingsPanel } from '@/components/settings/SettingsPanel';
import { ErrorReporter } from '@/components/diagnostics/ErrorReporter';
import { FileTree } from '@/components/files/FileTree';
import { CodeEditor } from '@/components/editor/CodeEditor';
import { useWorkspaces } from '@/hooks/useWorkspaces';
import { useTerminals } from '@/hooks/useTerminals';

type MainView = 'projects' | 'workspace' | 'grid' | 'ide' | 'license' | 'git' | 'tasks' | 'collaboration' | 'plugins' | 'distribution' | 'settings';

export default function Home() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mainView, setMainView] = useState<MainView>('workspace');

  const { workspaces, activeId } = useWorkspaces();
  useTerminals(); // Hook for side effects

  return (
    <div style={{
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      background: '#0a0a0a',
      color: '#e8e8e8',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      overflow: 'hidden',
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
          />
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

          {/* Phase 3: License View */}
          {mainView === 'license' && <LicensePanel />}

          {/* Phase 8: Git View */}
          {mainView === 'git' && <GitPanel />}

          {/* Phase 9: Tasks View */}
          {mainView === 'tasks' && <TaskAutomation />}

          {/* Phase 10: Collaboration View */}
          {mainView === 'collaboration' && <CollaborationPanel />}

          {/* Phase 11: Plugins View */}
          {mainView === 'plugins' && <PluginManager />}

          {/* Phase 12: Distribution View */}
          {mainView === 'distribution' && <DistributionPanel />}

          {/* Settings View */}
          {/* Phase 6: Settings View */}
          {mainView === 'settings' && <SettingsPanel />}

          {/* Phase 0/1: Terminal Views */}
          {(mainView === 'workspace' || mainView === 'grid') && <TerminalPool />}

          {/* Phase 7: IDE View */}
          {mainView === 'ide' && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <div style={{
                padding: '12px',
                borderBottom: '1px solid #2a2a2a',
                fontSize: '12px',
                color: '#888',
              }}>
                IDE View — CodeMirror 6 Editor with full language support
              </div>
              <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
                <div style={{ width: '200px', borderRight: '1px solid #2a2a2a', overflow: 'auto' }}>
                  <FileTree onFileSelect={() => {}} />
                </div>
                <CodeEditor filePath="" />
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
