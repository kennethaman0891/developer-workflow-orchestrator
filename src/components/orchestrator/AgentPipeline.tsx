'use client';

import { useState } from 'react';
import { useTheme } from '@/contexts/ThemeContext';

interface AgentTask {
  id: string;
  name: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  output: string;
  progress: number;
}

export function AgentPipeline() {
  const { theme } = useTheme();
  const [tasks, setTasks] = useState<AgentTask[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setUploadProgress(0);

    // Simulate upload progress
    const interval = setInterval(() => {
      setUploadProgress(prev => {
        if (prev >= 90) {
          clearInterval(interval);
          return 90;
        }
        return prev + 10;
      });
    }, 100);

    try {
      // In a real implementation, this would call the Tauri backend
      // to process the ZIP and distribute tasks to agents
      await new Promise(resolve => setTimeout(resolve, 2000));

      setTasks([
        { id: '1', name: 'Code Analysis Agent', status: 'completed', output: 'Analysis complete', progress: 100 },
        { id: '2', name: 'Test Generation Agent', status: 'running', output: 'Running tests...', progress: 65 },
        { id: '3', name: 'Documentation Agent', status: 'pending', output: '', progress: 0 },
        { id: '4', name: 'Refactoring Agent', status: 'pending', output: '', progress: 0 },
      ]);
    } catch (error) {
      console.error('Upload failed:', error);
    } finally {
      setIsUploading(false);
      clearInterval(interval);
      setUploadProgress(0);
    }
  };

  return (
    <div style={{ flex: 1, padding: '24px', overflow: 'auto' }}>
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '20px', fontWeight: 600, color: theme.colors.text, margin: '0 0 8px 0' }}>
          Agent Pipeline
        </h1>
        <p style={{ fontSize: '13px', color: theme.colors.textMuted, margin: 0 }}>
          Upload a ZIP file to distribute tasks across multiple agents
        </p>
      </div>

      {/* Upload area */}
      <div style={{
        border: `2px dashed ${theme.colors.border}`,
        borderRadius: '8px',
        padding: '32px',
        textAlign: 'center',
        marginBottom: '24px',
        transition: 'border-color 0.2s',
      }}
      onMouseEnter={e => e.currentTarget.style.borderColor = theme.colors.accent}
      onMouseLeave={e => e.currentTarget.style.borderColor = theme.colors.border}
      >
        <input
          type="file"
          accept=".zip"
          onChange={handleUpload}
          disabled={isUploading}
          style={{ display: 'none' }}
          id="zip-upload"
        />
        <label htmlFor="zip-upload" style={{ cursor: isUploading ? 'not-allowed' : 'pointer' }}>
          <div style={{ fontSize: '40px', marginBottom: '12px' }}>📦</div>
          <div style={{ fontSize: '14px', color: theme.colors.text, marginBottom: '8px' }}>
            {isUploading ? 'Processing...' : 'Drop ZIP file here or click to browse'}
          </div>
          <div style={{ fontSize: '12px', color: theme.colors.textMuted }}>
            Supports project archives with agent configuration
          </div>
        </label>
        {isUploading && (
          <div style={{ marginTop: '16px' }}>
            <div style={{
              height: '4px',
              background: theme.colors.bgTertiary,
              borderRadius: '2px',
              overflow: 'hidden',
            }}>
              <div style={{
                width: `${uploadProgress}%`,
                height: '100%',
                background: theme.colors.accent,
                transition: 'width 0.1s',
              }} />
            </div>
            <div style={{ fontSize: '11px', color: theme.colors.textMuted, marginTop: '4px' }}>
              {uploadProgress}%
            </div>
          </div>
        )}
      </div>

      {/* Agent tasks */}
      {tasks.length > 0 && (
        <div>
          <div style={{ fontSize: '12px', color: theme.colors.textMuted, marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Running Agents
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {tasks.map(task => (
              <AgentTaskCard key={task.id} task={task} />
            ))}
          </div>
        </div>
      )}

      {/* Agent configuration */}
      <div style={{ marginTop: '24px', padding: '16px', background: theme.colors.bgSecondary, borderRadius: '8px', border: `1px solid ${theme.colors.border}` }}>
        <div style={{ fontSize: '13px', fontWeight: 500, color: theme.colors.text, marginBottom: '12px' }}>
          Agent Configuration
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '12px' }}>
          <AgentConfigSlot label="Analyzer" icon="🔍" enabled />
          <AgentConfigSlot label="Tester" icon="🧪" enabled />
          <AgentConfigSlot label="Doc Writer" icon="📝" enabled={false} />
          <AgentConfigSlot label="Refactorer" icon="🔧" enabled={false} />
        </div>
      </div>
    </div>
  );
}

function AgentTaskCard({ task }: { task: AgentTask }) {
  const { theme } = useTheme();
  const statusColors = {
    pending: theme.colors.textMuted,
    running: theme.colors.accent,
    completed: '#4ade80',
    failed: '#f87171',
  };

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      padding: '12px',
      background: theme.colors.bg,
      border: `1px solid ${theme.colors.border}`,
      borderRadius: '6px',
    }}>
      <div style={{
        width: '8px',
        height: '8px',
        borderRadius: '50%',
        background: statusColors[task.status],
      }} />
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: '12px', fontWeight: 500, color: theme.colors.text }}>
          {task.name}
        </div>
        <div style={{ fontSize: '11px', color: theme.colors.textMuted, marginTop: '2px' }}>
          {task.output || task.status}
        </div>
      </div>
      <div style={{ fontSize: '11px', color: theme.colors.textMuted, minWidth: '40px', textAlign: 'right' }}>
        {task.progress}%
      </div>
    </div>
  );
}

function AgentConfigSlot({ label, icon, enabled }: { label: string; icon: string; enabled: boolean }) {
  const { theme } = useTheme();
  return (
    <div style={{
      padding: '12px',
      background: theme.colors.bgTertiary,
      border: `1px solid ${enabled ? theme.colors.border : theme.colors.border}`,
      borderRadius: '6px',
      opacity: enabled ? 1 : 0.5,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{ fontSize: '16px' }}>{icon}</span>
        <span style={{ fontSize: '12px', color: theme.colors.text }}>{label}</span>
        {enabled && <span style={{ fontSize: '10px', color: '#4ade80' }}>✓</span>}
      </div>
    </div>
  );
}
