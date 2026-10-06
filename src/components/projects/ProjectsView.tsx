'use client';

import { useState } from 'react';
import { useTheme } from '@/contexts/ThemeContext';
import { useWorkspaces } from '@/contexts/WorkspacesContext';
import { type Workspace } from '@/lib/workspace';

interface ProjectsViewProps {
  onContinue?: (id: string) => void;
  onDeleteWorkspace?: (id: string) => void;
}

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
        background: 'var(--dwo-color-bg-secondary)',
        border: `1px solid ${'var(--dwo-color-border)'}`,
        borderRadius: '8px',
        padding: '16px',
        cursor: 'pointer',
        textAlign: 'left',
        transition: 'border-color 0.2s',
        width: '100%',
      }}
      onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--dwo-color-accent)')}
      onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--dwo-color-border)')}
    >
      <div style={{ fontSize: '24px', marginBottom: '8px' }}>{icon}</div>
      <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--dwo-color-text)' }}>{title}</div>
      <div style={{ fontSize: '11px', color: 'var(--dwo-color-text-muted)', marginTop: '4px' }}>
        {description}
      </div>
    </button>
  );
}

function WorkspaceCard({
  ws,
  isActive,
  onContinue,
  onDelete,
}: {
  ws: Workspace;
  isActive: boolean;
  onContinue?: () => void;
  onDelete?: () => void;
}) {
  const { theme } = useTheme();
  const [hovered, setHovered] = useState(false);

  const pathDisplay = ws.path
    ? ws.path.split('/').filter(Boolean).slice(-2).join('/')
    : 'No project folder';

  return (
    <div
      style={{
        position: 'relative',
        background: 'var(--dwo-color-bg-secondary)',
        border: `1px solid ${isActive ? 'var(--dwo-color-accent)' : 'var(--dwo-color-border)'}`,
        borderRadius: '8px',
        padding: '16px',
        transition: 'all 0.2s',
        cursor: 'default',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Active indicator bar */}
      {isActive && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: '2px',
            background: 'var(--dwo-color-accent)',
            borderRadius: '8px 8px 0 0',
          }}
        />
      )}

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
        {/* Color dot */}
        {ws.color && (
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: ws.color,
              flexShrink: 0,
              marginTop: '6px',
              opacity: 0.9,
            }}
          />
        )}

        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Name */}
          <div
            style={{
              fontSize: '13px',
              fontWeight: isActive ? 600 : 500,
              color: 'var(--dwo-color-text)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {ws.name}
          </div>

          {/* Path */}
          <div
            style={{
              fontSize: '11px',
              color: 'var(--dwo-color-text-muted)',
              fontFamily: 'monospace',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              marginTop: '2px',
            }}
          >
            {pathDisplay}
          </div>

          {/* Date */}
          <div
            style={{
              fontSize: '10px',
              color: 'var(--dwo-color-text-muted)',
              marginTop: '4px',
              opacity: 0.7,
            }}
          >
            {new Date(ws.created_at).toLocaleDateString()}
          </div>
        </div>

        {/* Actions - shown on hover */}
        <div
          style={{
            display: 'flex',
            gap: '4px',
            opacity: hovered ? 1 : 0,
            transition: 'opacity 0.15s',
            flexShrink: 0,
          }}
        >
          {/* Continue button */}
          {onContinue && (
            <button
              onClick={onContinue}
              style={{
                background: 'var(--dwo-color-accent)',
                color: '#fff',
                border: 'none',
                borderRadius: '4px',
                padding: '4px 8px',
                fontSize: '10px',
                fontWeight: 500,
                cursor: 'pointer',
                lineHeight: '16px',
                transition: 'opacity 0.15s',
              }}
              onMouseEnter={e => (e.currentTarget.style.opacity = '0.85')}
              onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
              title="Continue working"
            >
              Continue
            </button>
          )}

          {/* Delete button */}
          {onDelete && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              style={{
                background: 'transparent',
                color: 'var(--dwo-color-text-muted)',
                border: 'none',
                borderRadius: '4px',
                padding: '4px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'color 0.15s, background 0.15s',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.color = '#ef4444';
                e.currentTarget.style.background = '#ef444418';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.color = 'var(--dwo-color-text-muted)';
                e.currentTarget.style.background = 'transparent';
              }}
              title="Delete workspace"
            >
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <line x1="4" y1="4" x2="12" y2="12" />
                <line x1="12" y1="4" x2="4" y2="12" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function ProjectsView({ onContinue, onDeleteWorkspace }: ProjectsViewProps) {
  const { theme } = useTheme();
  const { workspaces, activeId, create } = useWorkspaces();
  const [newName, setNewName] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const projects = [
    { title: 'New Workspace', desc: 'Create empty workspace', icon: '📁' },
    { title: 'Import Project', desc: 'Import from ZIP or Git', icon: '📦' },
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
        <h1 style={{ fontSize: '20px', fontWeight: 600, color: 'var(--dwo-color-text)', margin: '0 0 8px 0' }}>
          Projects
        </h1>
        <p style={{ fontSize: '13px', color: 'var(--dwo-color-text-muted)', margin: 0 }}>
          Create or import a project to get started
        </p>
      </div>

      {/* Quick Actions */}
      <div style={{ marginBottom: '24px' }}>
        <div style={{ fontSize: '12px', color: 'var(--dwo-color-text-muted)', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
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

      {/* Recent Workspaces */}
      {workspaces.length > 0 && (
        <div>
          <div style={{ fontSize: '12px', color: 'var(--dwo-color-text-muted)', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Recent Workspaces
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '12px' }}>
            {workspaces.map(ws => (
              <WorkspaceCard
                key={ws.id}
                ws={ws}
                isActive={ws.id === activeId}
                onContinue={onContinue ? () => onContinue(ws.id) : undefined}
                onDelete={() => onDeleteWorkspace?.(ws.id)}
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
          // Above the handoff panel (z 60) so New Workspace stays
          // clickable when both are open; below the wizard modal (1000).
          zIndex: 70,
          background: 'var(--dwo-color-bg-secondary)',
          border: `1px solid ${'var(--dwo-color-border)'}`,
          borderRadius: '8px',
          padding: '16px',
          minWidth: '300px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
        }}>
          <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--dwo-color-text)', marginBottom: '8px' }}>
            New Workspace
          </div>
          <input
            type="text"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder="Workspace name..."
            style={{
              width: '100%',
              background: 'var(--dwo-color-bg)',
              border: `1px solid ${'var(--dwo-color-border)'}`,
              color: 'var(--dwo-color-text)',
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
                background: 'var(--dwo-color-accent)',
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
                background: 'var(--dwo-color-bg-tertiary)',
                color: 'var(--dwo-color-text)',
                border: `1px solid ${'var(--dwo-color-border)'}`,
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
