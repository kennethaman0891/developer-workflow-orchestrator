'use client';

import { useState } from 'react';
import { useTheme } from '@/contexts/ThemeContext';
import { useWorkspaces } from '@/hooks/useWorkspaces';

interface ProjectCardProps {
  title: string;
  description: string;
  icon: string;
  onClick: () => void;
}

function ProjectCard({ title, description, icon, onClick }: ProjectCardProps) {
  const { theme } = useTheme();
  return (
    <button
      onClick={onClick}
      style={{
        background: theme.colors.bgSecondary,
        border: `1px solid ${theme.colors.border}`,
        borderRadius: '8px',
        padding: '16px',
        cursor: 'pointer',
        textAlign: 'left',
        transition: 'border-color 0.2s',
        width: '100%',
      }}
      onMouseEnter={e => (e.currentTarget.style.borderColor = theme.colors.accent)}
      onMouseLeave={e => (e.currentTarget.style.borderColor = theme.colors.border)}
    >
      <div style={{ fontSize: '24px', marginBottom: '8px' }}>{icon}</div>
      <div style={{ fontSize: '13px', fontWeight: 500, color: theme.colors.text }}>{title}</div>
      <div style={{ fontSize: '11px', color: theme.colors.textMuted, marginTop: '4px' }}>
        {description}
      </div>
    </button>
  );
}

export function ProjectsView() {
  const { theme } = useTheme();
  const { workspaces, create } = useWorkspaces();
  const [newName, setNewName] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const projects = [
    { title: 'New Workspace', desc: 'Create empty workspace', icon: '📁' },
    { title: 'Import Project', desc: 'Import from ZIP or Git', icon: '📦' },
    { title: 'Agent Pipeline', desc: 'Multi-agent workflow', icon: '🤖' },
    { title: 'Templates', desc: 'Starter templates', icon: '📋' },
  ];

  const handleCreate = async () => {
    if (!newName.trim()) return;
    try {
      await create(newName);
      setNewName('');
      setIsCreating(false);
    } catch (error) {
      console.error('Failed to create workspace:', error);
    }
  };

  return (
    <div style={{ flex: 1, padding: '24px', overflow: 'auto' }}>
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '20px', fontWeight: 600, color: theme.colors.text, margin: '0 0 8px 0' }}>
          Projects
        </h1>
        <p style={{ fontSize: '13px', color: theme.colors.textMuted, margin: 0 }}>
          Create or import a project to get started
        </p>
      </div>

      {/* Create new */}
      <div style={{ marginBottom: '24px' }}>
        <div style={{ fontSize: '12px', color: theme.colors.textMuted, marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Quick Actions
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '12px' }}>
          {projects.map(p => (
            <ProjectCard
              key={p.title}
              title={p.title}
              description={p.desc}
              icon={p.icon}
              onClick={() => p.title === 'New Workspace' && setIsCreating(true)}
            />
          ))}
        </div>
      </div>

      {/* Recent workspaces */}
      {workspaces.length > 0 && (
        <div>
          <div style={{ fontSize: '12px', color: theme.colors.textMuted, marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Recent Workspaces
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '12px' }}>
            {workspaces.map(ws => (
              <ProjectCard
                key={ws.id}
                title={ws.name}
                description={`${new Date(ws.created_at).toLocaleDateString()}`}
                icon='💼'
                onClick={() => {}}
              />
            ))}
          </div>
        </div>
      )}

      {/* Create input */}
      {isCreating && (
        <div style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          background: theme.colors.bgSecondary,
          border: `1px solid ${theme.colors.border}`,
          borderRadius: '8px',
          padding: '16px',
          minWidth: '300px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
        }}>
          <div style={{ fontSize: '13px', fontWeight: 500, color: theme.colors.text, marginBottom: '8px' }}>
            New Workspace
          </div>
          <input
            type="text"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder="Workspace name..."
            style={{
              width: '100%',
              background: theme.colors.bg,
              border: `1px solid ${theme.colors.border}`,
              color: theme.colors.text,
              padding: '6px 10px',
              borderRadius: '4px',
              fontSize: '12px',
              marginBottom: '8px',
              boxSizing: 'border-box',
            }}
            autoFocus
            onKeyDown={e => e.key === 'Enter' && handleCreate()}
          />
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={handleCreate}
              style={{
                flex: 1,
                background: theme.colors.accent,
                color: '#fff',
                border: 'none',
                padding: '6px 12px',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '11px',
              }}
            >
              Create
            </button>
            <button
              onClick={() => setIsCreating(false)}
              style={{
                flex: 1,
                background: theme.colors.bgTertiary,
                color: theme.colors.text,
                border: `1px solid ${theme.colors.border}`,
                padding: '6px 12px',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '11px',
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
