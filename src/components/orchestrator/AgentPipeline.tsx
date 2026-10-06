'use client';

import { useState } from 'react';

interface AgentTask {
  id: string;
  name: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  output: string;
  progress: number;
}

export function AgentPipeline() {
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
        <h1 style={{ fontSize: '20px', fontWeight: 600, color: 'var(--dwo-color-text)', margin: '0 0 8px 0' }}>
          Agent Pipeline
        </h1>
        <p style={{ fontSize: '13px', color: 'var(--dwo-color-text-muted)', margin: 0 }}>
          Upload a ZIP file to distribute tasks across multiple agents
        </p>
      </div>

      {/* Upload area */}
      <div style={{
        border: `2px dashed var(--dwo-color-border)`,
        borderRadius: '8px',
        padding: '32px',
        textAlign: 'center',
        marginBottom: '24px',
        transition: 'border-color 0.2s',
      }}
      onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--dwo-color-accent)'}
      onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--dwo-color-border)'}
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
          <div style={{ fontSize: '14px', color: 'var(--dwo-color-text)', marginBottom: '8px' }}>
            {isUploading ? 'Processing...' : 'Drop ZIP file here or click to browse'}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--dwo-color-text-muted)' }}>
            Supports project archives with agent configuration
          </div>
        </label>
        {isUploading && (
          <div style={{ marginTop: '16px' }}>
            <div style={{
              height: '4px',
              background: 'var(--dwo-color-bg-tertiary)',
              borderRadius: '2px',
              overflow: 'hidden',
            }}>
              <div style={{
                width: `${uploadProgress}%`,
                height: '100%',
                background: 'var(--dwo-color-accent)',
                transition: 'width 0.1s',
              }} />
            </div>
            <div style={{ fontSize: '11px', color: 'var(--dwo-color-text-muted)', marginTop: '4px' }}>
              {uploadProgress}%
            </div>
          </div>
        )}
      </div>

      {/* Agent tasks */}
      {tasks.length > 0 && (
        <div>
          <div style={{ fontSize: '12px', color: 'var(--dwo-color-text-muted)', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
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
      <div style={{ marginTop: '24px', padding: '16px', background: 'var(--dwo-color-bg-secondary)', borderRadius: '8px', border: `1px solid var(--dwo-color-border)` }}>
        <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--dwo-color-text)', marginBottom: '12px' }}>
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
    const statusColors = {
    pending: 'var(--dwo-color-text-muted)',
    running: 'var(--dwo-color-accent)',
    completed: 'var(--dwo-color-success)',
    failed: 'var(--dwo-color-error)',
  };

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      padding: '12px',
      background: 'var(--dwo-color-bg)',
      border: `1px solid var(--dwo-color-border)`,
      borderRadius: '6px',
    }}>
      <div style={{
        width: '8px',
        height: '8px',
        borderRadius: '50%',
        background: statusColors[task.status],
      }} />
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--dwo-color-text)' }}>
          {task.name}
        </div>
        <div style={{ fontSize: '11px', color: 'var(--dwo-color-text-muted)', marginTop: '2px' }}>
          {task.output || task.status}
        </div>
      </div>
      <div style={{ fontSize: '11px', color: 'var(--dwo-color-text-muted)', minWidth: '40px', textAlign: 'right' }}>
        {task.progress}%
      </div>
    </div>
  );
}

function AgentConfigSlot({ label, icon, enabled }: { label: string; icon: string; enabled: boolean }) {
    return (
    <div style={{
      padding: '12px',
      background: 'var(--dwo-color-bg-tertiary)',
      border: `1px solid ${enabled ? 'var(--dwo-color-border)' : 'var(--dwo-color-border)'}`,
      borderRadius: '6px',
      opacity: enabled ? 1 : 0.5,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{ fontSize: '16px' }}>{icon}</span>
        <span style={{ fontSize: '12px', color: 'var(--dwo-color-text)' }}>{label}</span>
        {enabled && <span style={{ fontSize: '10px', color: 'var(--dwo-color-success)' }}>✓</span>}
      </div>
    </div>
  );
}
