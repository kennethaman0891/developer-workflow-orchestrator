'use client';

import { useState } from 'react';
import { useTasks } from '@/hooks/useTasks';

export function TaskAutomation() {
    const { tasks, updateStatus, deleteTask } = useTasks();
  const [isAdding, setIsAdding] = useState(false);
  const [newTaskName, setNewTaskName] = useState('');
  const [newTaskCommand, setNewTaskCommand] = useState('');
  const [newTaskSchedule, setNewTaskSchedule] = useState('0 * * * *');

  const handleToggle = async (id: string, currentStatus: string) => {
    const newStatus = currentStatus === 'active' ? 'paused' : 'active';
    await updateStatus(id, newStatus);
  };

  const handleDelete = async (id: string) => {
    if (confirm('Delete this task?')) {
      await deleteTask(id);
    }
  };

  const handleAddTask = async () => {
    if (!newTaskName.trim() || !newTaskCommand.trim()) return;
    // In a real implementation, this would call the createTask hook
    setNewTaskName('');
    setNewTaskCommand('');
    setNewTaskSchedule('0 * * * *');
    setIsAdding(false);
  };

  return (
    <div style={{ flex: 1, padding: '24px', overflow: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '20px', fontWeight: 600, color: 'var(--dwo-color-text)', margin: '0 0 8px 0' }}>
            Task Automation
          </h1>
          <p style={{ fontSize: '13px', color: 'var(--dwo-color-text-muted)', margin: 0 }}>
            Schedule and automate your development workflows
          </p>
        </div>
        <button
          onClick={() => setIsAdding(true)}
          style={styles.button()}
        >
          + New Task
        </button>
      </div>

      {/* Add task form */}
      {isAdding && (
        <div style={{
          marginBottom: '16px',
          padding: '16px',
          background: 'var(--dwo-color-bg-secondary)',
          border: `1px solid var(--dwo-color-border)`,
          borderRadius: 'var(--dwo-radius-md)',
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <input
              type="text"
              placeholder="Task name..."
              value={newTaskName}
              onChange={e => setNewTaskName(e.target.value)}
              style={styles.input()}
            />
            <input
              type="text"
              placeholder="Command (e.g., npm test)"
              value={newTaskCommand}
              onChange={e => setNewTaskCommand(e.target.value)}
              style={styles.input()}
            />
            <input
              type="text"
              placeholder="Cron schedule (default: every hour)"
              value={newTaskSchedule}
              onChange={e => setNewTaskSchedule(e.target.value)}
              style={styles.input()}
            />
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={handleAddTask} style={styles.button()}>Create</button>
              <button onClick={() => setIsAdding(false)} style={styles.secondaryButton()}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Tasks list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {tasks.length === 0 ? (
          <div style={{
            padding: '24px',
            textAlign: 'center',
            color: 'var(--dwo-color-text-muted)',
            fontSize: '13px',
          }}>
            No tasks yet. Click "+ New Task" to create one.
          </div>
        ) : (
          tasks.map(task => (
            <div key={task.id} style={{
              display: 'flex',
              alignItems: 'center',
              gap: '16px',
              padding: '16px',
              background: 'var(--dwo-color-bg-secondary)',
              border: `1px solid var(--dwo-color-border)`,
              borderRadius: 'var(--dwo-radius-md)',
            }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--dwo-color-text)' }}>
                  {task.name}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--dwo-color-text-muted)', marginTop: '4px' }}>
                  {task.command} · Schedule: {task.schedule}
                </div>
                {task.last_run && (
                  <div style={{ fontSize: '10px', color: 'var(--dwo-color-text-muted)', marginTop: '2px' }}>
                    Last run: {task.last_run}
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => handleToggle(task.id, task.status)}
                  style={{
                    padding: '6px 12px',
                    background: task.status === 'active' ? 'var(--dwo-color-success)' : 'var(--dwo-color-bg-tertiary)',
                    color: task.status === 'active' ? '#000' : 'var(--dwo-color-text-muted)',
                    border: 'none',
                    borderRadius: 'var(--dwo-radius-sm)',
                    cursor: 'pointer',
                    fontSize: '11px',
                    fontWeight: 500,
                  }}
                >
                  {task.status === 'active' ? 'Active' : 'Paused'}
                </button>
                <button
                  onClick={() => handleDelete(task.id)}
                  style={styles.iconButton()}
                >
                  🗑️
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Pipeline visualization */}
      <div style={{ marginTop: '24px', padding: '16px', background: 'var(--dwo-color-bg-secondary)', borderRadius: 'var(--dwo-radius-md)', border: `1px solid var(--dwo-color-border)` }}>
        <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--dwo-color-text)', marginBottom: '16px' }}>
          CI/CD Pipeline
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          {['Checkout', 'Build', 'Test', 'Lint', 'Security Scan', 'Package', 'Deploy'].map((step, i) => (
            <div key={step} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{
                padding: '8px 12px',
                background: 'var(--dwo-color-bg-tertiary)',
                border: `1px solid var(--dwo-color-border)`,
                borderRadius: 'var(--dwo-radius-sm)',
                fontSize: '11px',
                color: 'var(--dwo-color-text)',
              }}>
                {step}
              </div>
              {i < 6 && <span style={{ color: 'var(--dwo-color-text-muted)' }}>→</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const styles = {
  button: () => ({
    background: 'var(--dwo-color-accent)',
    color: '#fff',
    border: 'none',
    padding: '8px 16px',
    borderRadius: 'var(--dwo-radius-sm)',
    cursor: 'pointer',
    fontSize: '12px',
    fontWeight: 500,
  }),
  secondaryButton: () => ({
    background: 'var(--dwo-color-bg)',
    color: 'var(--dwo-color-text)',
    border: `1px solid var(--dwo-color-border)`,
    padding: '8px 16px',
    borderRadius: 'var(--dwo-radius-sm)',
    cursor: 'pointer',
    fontSize: '12px',
  }),
  input: () => ({
    background: 'var(--dwo-color-bg)',
    border: `1px solid var(--dwo-color-border)`,
    color: 'var(--dwo-color-text)',
    padding: '8px 12px',
    borderRadius: 'var(--dwo-radius-sm)',
    fontSize: '12px',
    width: '100%',
    boxSizing: 'border-box' as const,
  }),
  iconButton: () => ({
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontSize: '14px',
    padding: '4px',
  }),
};
