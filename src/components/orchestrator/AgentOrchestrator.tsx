'use client';

import { useState } from 'react';
import { useAgents, type AgentTask } from '@/hooks/useAgents';
export function AgentOrchestrator() {
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
        borderBottom: `1px solid var(--dwo-color-border)`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <div>
          <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--dwo-color-text)' }}>
            Multi-Agent Orchestration
          </div>
          <div style={{ fontSize: '11px', color: 'var(--dwo-color-text-muted)', marginTop: '2px' }}>
            Upload ZIP to distribute tasks across agents
          </div>
        </div>
        <button
          onClick={() => setIsCreating(true)}
          style={styles.button()}
        >
          + New Task
        </button>
      </div>

      {/* Create form */}
      {isCreating && (
        <div style={{
          padding: '12px 16px',
          borderBottom: `1px solid var(--dwo-color-border)`,
          background: 'var(--dwo-color-bg-secondary)',
        }}>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <input
              type="text"
              placeholder="Task name..."
              value={newTaskName}
              onChange={e => setNewTaskName(e.target.value)}
              style={styles.input()}
            />
            <select
              value={newTaskType}
              onChange={e => setNewTaskType(e.target.value)}
              style={styles.select()}
            >
              <option value="analyzer">Analyzer</option>
              <option value="tester">Tester</option>
              <option value="documenter">Documenter</option>
              <option value="refactorer">Refactorer</option>
            </select>
            <button onClick={handleCreateTask} style={styles.button()}>Create</button>
            <button onClick={() => setIsCreating(false)} style={styles.secondaryButton()}>Cancel</button>
          </div>
        </div>
      )}

      {/* Task list */}
      <div style={{ flex: 1, overflow: 'auto', padding: '16px' }}>
        {tasks.length === 0 ? (
          <div style={{
            padding: '40px',
            textAlign: 'center',
            color: 'var(--dwo-color-text-muted)',
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
        borderTop: `1px solid var(--dwo-color-border)`,
        background: 'var(--dwo-color-bg-secondary)',
      }}>
        <div style={{ fontSize: '11px', color: 'var(--dwo-color-text-muted)', marginBottom: '8px' }}>
          Available Agents: {configs.length}
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {configs.length === 0 ? (
            <span style={{ fontSize: '11px', color: 'var(--dwo-color-text-muted)' }}>No agent configurations</span>
          ) : (
            configs.map(config => (
              <div
                key={config.id}
                style={{
                  padding: '4px 8px',
                  background: config.enabled ? `var(--dwo-color-success)18` : 'var(--dwo-color-bg-tertiary)',
                  border: `1px solid ${config.enabled ? 'var(--dwo-color-success)' : 'var(--dwo-color-border)'}`,
                  borderRadius: 'var(--dwo-radius-sm)',
                  fontSize: '11px',
                  color: config.enabled ? 'var(--dwo-color-success)' : 'var(--dwo-color-text-muted)',
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
      borderRadius: 'var(--dwo-radius-md)',
    }}>
      <div style={{
        width: '8px',
        height: '8px',
        borderRadius: '50%',
        background: statusColors[task.status as keyof typeof statusColors],
      }} />
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--dwo-color-text)' }}>
          {task.name}
        </div>
        <div style={{ fontSize: '11px', color: 'var(--dwo-color-text-muted)', marginTop: '2px' }}>
          {task.agent_type} · {task.progress}%
        </div>
      </div>
      {task.output && (
        <div style={{ fontSize: '11px', color: 'var(--dwo-color-text-muted)', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {task.output}
        </div>
      )}
    </div>
  );
}

const styles = {
  button: () => ({
    background: 'var(--dwo-color-accent)',
    color: '#fff',
    border: 'none',
    padding: '6px 12px',
    borderRadius: 'var(--dwo-radius-sm)',
    cursor: 'pointer',
    fontSize: '12px',
    fontWeight: 500,
  }),
  secondaryButton: () => ({
    background: 'var(--dwo-color-bg)',
    color: 'var(--dwo-color-text)',
    border: `1px solid var(--dwo-color-border)`,
    padding: '6px 12px',
    borderRadius: 'var(--dwo-radius-sm)',
    cursor: 'pointer',
    fontSize: '12px',
  }),
  input: () => ({
    flex: 1,
    background: 'var(--dwo-color-bg)',
    border: `1px solid var(--dwo-color-border)`,
    color: 'var(--dwo-color-text)',
    padding: '6px 10px',
    borderRadius: 'var(--dwo-radius-sm)',
    fontSize: '12px',
  }),
  select: () => ({
    background: 'var(--dwo-color-bg)',
    border: `1px solid var(--dwo-color-border)`,
    color: 'var(--dwo-color-text)',
    padding: '6px 10px',
    borderRadius: 'var(--dwo-radius-sm)',
    fontSize: '12px',
  }),
};
