'use client';

/**
 * WizardView — New Workspace wizard.
 *
 * Collects three things:
 *   1. Project path — via native OS folder picker or typed
 *   2. Template — how many terminals (1, 2, 4, 6, 8, 10, 12, 14, 16)
 *   3. Command (optional) — CLI to auto-launch in every pane
 *
 * Triggered by Cmd+T or the sidebar "+" button.
 */

import { useState, useCallback, useEffect } from 'react';
import { useTheme } from '@/contexts/ThemeContext';
import { useWorkspaces } from '@/hooks/useWorkspaces';
import { selectFolder, WORKSPACE_COLORS, type WorkspaceTemplate } from '@/lib/workspace';

const TEMPLATE_OPTIONS: WorkspaceTemplate[] = [1, 2, 4, 6, 8, 10, 12, 14, 16];

interface WizardViewProps {
  /** Called when the wizard is closed (cancel or after creation) */
  onClose: () => void;
}

export function WizardView({ onClose }: WizardViewProps) {
  const { theme } = useTheme();
  const { create, selectFolder: _selectFolder } = useWorkspaces();

  const [projectPath, setProjectPath] = useState<string>('');
  const [template, setTemplate] = useState<WorkspaceTemplate>(4);
  const [command, setCommand] = useState('');
  const [color, setColor] = useState<string>(WORKSPACE_COLORS[0]);
  const [isCreating, setIsCreating] = useState(false);

  /** Open the native OS folder picker */
  const handlePickFolder = useCallback(async () => {
    const path = await selectFolder();
    if (path) {
      setProjectPath(path);
    }
  }, []);

  /** Submit the wizard → create workspace → close */
  const handleCreate = useCallback(async () => {
    // Extract workspace name from project path
    const name = projectPath
      ? projectPath.split('/').filter(Boolean).pop() || 'Untitled'
      : 'New Workspace';

    setIsCreating(true);
    try {
      await create(
        name,
        projectPath || null,
        template,
        command || null,
        color,
      );
      onClose();
    } catch (error) {
      console.error('Wizard failed:', error);
    } finally {
      setIsCreating(false);
    }
  }, [projectPath, template, command, color, create, onClose]);

  // Close on Escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0, 0, 0, 0.6)',
        backdropFilter: 'blur(4px)',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          background: theme.colors.bgSecondary,
          border: `1px solid ${theme.colors.border}`,
          borderRadius: '12px',
          width: '460px',
          maxHeight: '85vh',
          overflow: 'auto',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '20px 24px 0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <h2 style={{
            fontSize: '16px',
            fontWeight: 600,
            color: theme.colors.text,
            margin: 0,
          }}>
            New Workspace
          </h2>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: theme.colors.textMuted,
              cursor: 'pointer',
              fontSize: '18px',
              padding: '4px 8px',
              borderRadius: '4px',
            }}
          >
            &times;
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '16px 24px 24px' }}>
          {/* 1. Project Path */}
          <div style={{ marginBottom: '20px' }}>
            <label style={labelStyle(theme)}>
              Project Path
            </label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="text"
                value={projectPath}
                onChange={(e) => setProjectPath(e.target.value)}
                placeholder="/path/to/project (or pick a folder)"
                style={{
                  flex: 1,
                  background: theme.colors.bg,
                  border: `1px solid ${theme.colors.border}`,
                  color: theme.colors.text,
                  padding: '8px 12px',
                  borderRadius: '6px',
                  fontSize: '13px',
                  fontFamily: theme.fonts.monospace,
                  outline: 'none',
                }}
              />
              <button
                onClick={handlePickFolder}
                style={{
                  background: theme.colors.bgTertiary,
                  border: `1px solid ${theme.colors.border}`,
                  color: theme.colors.text,
                  padding: '8px 14px',
                  borderRadius: '6px',
                  fontSize: '13px',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                Browse...
              </button>
            </div>
          </div>

          {/* 2. Template — number of terminal panes */}
          <div style={{ marginBottom: '20px' }}>
            <label style={labelStyle(theme)}>
              Terminal Panes
            </label>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(5, 1fr)',
              gap: '6px',
            }}>
              {TEMPLATE_OPTIONS.map((n) => (
                <button
                  key={n}
                  onClick={() => setTemplate(n)}
                  style={{
                    background: template === n ? theme.colors.accent : theme.colors.bg,
                    color: template === n ? '#fff' : theme.colors.text,
                    border: `1px solid ${template === n ? theme.colors.accent : theme.colors.border}`,
                    borderRadius: '6px',
                    padding: '8px 0',
                    fontSize: '13px',
                    fontWeight: template === n ? 600 : 400,
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                  }}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          {/* 3. Command (optional) */}
          <div style={{ marginBottom: '20px' }}>
            <label style={labelStyle(theme)}>
              Auto-launch command <span style={{ color: theme.colors.textMuted, fontWeight: 400 }}>(optional)</span>
            </label>
            <input
              type="text"
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              placeholder="e.g. opencode, claude, codex"
              style={{
                width: '100%',
                background: theme.colors.bg,
                border: `1px solid ${theme.colors.border}`,
                color: theme.colors.text,
                padding: '8px 12px',
                borderRadius: '6px',
                fontSize: '13px',
                fontFamily: theme.fonts.monospace,
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>

          {/* Color picker */}
          <div style={{ marginBottom: '24px' }}>
            <label style={labelStyle(theme)}>
              Color
            </label>
            <div style={{ display: 'flex', gap: '8px' }}>
              {WORKSPACE_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  style={{
                    width: '28px',
                    height: '28px',
                    borderRadius: '50%',
                    background: c,
                    border: color === c ? `2px solid ${theme.colors.text}` : '2px solid transparent',
                    cursor: 'pointer',
                    outline: color === c ? `2px solid ${theme.colors.text}` : 'none',
                    outlineOffset: '2px',
                    transition: 'outline 0.15s',
                  }}
                />
              ))}
            </div>
          </div>

          {/* Create / Cancel */}
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              onClick={onClose}
              style={{
                flex: 1,
                background: theme.colors.bgTertiary,
                color: theme.colors.text,
                border: `1px solid ${theme.colors.border}`,
                padding: '10px',
                borderRadius: '6px',
                fontSize: '13px',
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={isCreating}
              style={{
                flex: 1,
                background: theme.colors.accent,
                color: '#fff',
                border: 'none',
                padding: '10px',
                borderRadius: '6px',
                fontSize: '13px',
                fontWeight: 500,
                cursor: isCreating ? 'not-allowed' : 'pointer',
                opacity: isCreating ? 0.7 : 1,
              }}
            >
              {isCreating ? 'Creating...' : 'Create Workspace'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function labelStyle(theme: any): React.CSSProperties {
  return {
    display: 'block',
    fontSize: '12px',
    fontWeight: 500,
    color: theme.colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    marginBottom: '8px',
  };
}
