'use client';

import { useState } from 'react';
import { useTheme } from '@/contexts/ThemeContext';
import { useAgents } from '@/hooks/useAgents';

export function AgentOrchestrator() {
  const { theme } = useTheme();
  const { tasks, configs, createTask, updateTaskStatus } = useAgents();
  const [isCreating, setIsCreating] = useState(false);
  const [newTaskName, setNewTaskName] = useState('');
  const [newTaskType, setNewTaskType] = useState('analyzer');

  const handleCreateTask = async () => {
    if (!newTaskName.trim()) return;
    try {
      const taskId = await createTask(newTaskName, newTaskType, {});
      setNewTaskName('');
      setIsCreating(false);
      // Simulate task completion after a delay
      setTimeout(async () => {
        await updateTaskStatus(taskId, 'completed', 100, 'Task completed successfully!');
      }, 2000);
    } catch (error) {
      console.error('Failed to create task:', error);
    }
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{
        padding: '12px 16px',
        borderBottom: `1px solid ${theme.colors.border}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <div>
          <div style={{ fontSize: '14px', fontWeight: 600, color: theme.colors.text }}>
            Multi-Agent Orchestration
          </div>
          <div style={{ fontSize: '11px', color: theme.colors.textMuted, marginTop: '2px' }}>
            Upload ZIP to distribute tasks across agents
          </div>
        </div>
        <button
          onClick={() => setIsCreating(true)}
          style={styles.button(theme)}
        >
          + New Task
        </button>
      </div>

      {/* Create form */}
      {isCreating && (
        <div style={{
          padding: '12px 16px',
          borderBottom: `1px solid ${theme.colors.border}`,
          background: theme.colors.bgSecondary,
        }}>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <input
              type="text"
              placeholder="Task name..."
              value={newTaskName}
              onChange={e => setNewTaskName(e.target.value)}
              style={styles.input(theme)}
            />
            <select
              value={newTaskType}
              onChange={e => setNewTaskType(e.target.value)}
              style={styles.select(theme)}
            >
              <option value="analyzer">Analyzer</option>
              <option value="tester">Tester</option>
              <option value="documenter">Documenter</option>
              <option value="refactorer">Refactorer</option>
            </select>
            <button onClick={handleCreateTask} style={styles.button(theme)}>Create</button>
            <button onClick={() => setIsCreating(false)} style={styles.secondaryButton(theme)}>Cancel</button>
          </div>
        </div>
      )}

      {/* Task list */}
      <div style={{ flex: 1, overflow: 'auto', padding: '16px' }}>
        {tasks.length === 0 ? (
          <div style={{
            padding: '40px',
            textAlign: 'center',
            color: theme.colors.textMuted,
          }}>
            <div style={{ fontSize: '40px', marginBottom: '16px' }}>🤖</div>
            <div style={{ fontSize: '14px', marginBottom: '8px' }}>No agent tasks yet</div>
            <div style={{ fontSize: '12px' }}>Create a task to get started with multi-agent orchestration</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {tasks.map(task => (
              <AgentTaskCard key={task.id} task={task} />
            ))}
          </div>
        )}
      </div>

      {/* Agent configs */}
      <div style={{
        padding: '12px 16px',
        borderTop: `1px solid ${theme.colors.border}`,
        background: theme.colors.bgSecondary,
      }}>
        <div style={{ fontSize: '11px', color: theme.colors.textMuted, marginBottom: '8px' }}>
          Available Agents: {configs.length}
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {configs.length === 0 ? (
            <span style={{ fontSize: '11px', color: theme.colors.textMuted }}>No agent configurations</span>
          ) : (
            configs.map(config => (
              <div
                key={config.id}
                style={{
                  padding: '4px 8px',
                  background: config.enabled ? '#1a3a1a' : theme.colors.bgTertiary,
                  border: `1px solid ${config.enabled ? '#4ade80' : theme.colors.border}`,
                  borderRadius: '4px',
                  fontSize: '11px',
                  color: config.enabled ? '#4ade80' : theme.colors.textMuted,
                }}
              >
                {config.name} ({config.type})
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function AgentTaskCard({ task }: { task: { status: string } & Record<string, any> }) {
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
        background: statusColors[task.status as keyof typeof statusColors],
      }} />
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: '12px', fontWeight: 500, color: theme.colors.text }}>
          {task.name}
        </div>
        <div style={{ fontSize: '11px', color: theme.colors.textMuted, marginTop: '2px' }}>
          {task.agent_type} · {task.progress}%
        </div>
      </div>
      {task.output && (
        <div style={{ fontSize: '11px', color: theme.colors.textMuted, maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {task.output}
        </div>
      )}
    </div>
  );
}

const styles = {
  button: (t: any) => ({
    background: t.colors.accent,
    color: '#fff',
    border: 'none',
    padding: '6px 12px',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '12px',
    fontWeight: 500,
  }),
  secondaryButton: (t: any) => ({
    background: t.colors.bgTertiary,
    color: t.colors.text,
    border: `1px solid ${t.colors.border}`,
    padding: '6px 12px',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '12px',
  }),
  input: (t: any) => ({
    flex: 1,
    background: t.colors.bg,
    border: `1px solid ${t.colors.border}`,
    color: t.colors.text,
    padding: '6px 10px',
    borderRadius: '4px',
    fontSize: '12px',
  }),
  select: (t: any) => ({
    background: t.colors.bg,
    border: `1px solid ${t.colors.border}`,
    color: t.colors.text,
    padding: '6px 10px',
    borderRadius: '4px',
    fontSize: '12px',
  }),
};
