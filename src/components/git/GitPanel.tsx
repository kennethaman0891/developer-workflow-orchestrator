'use client';

import { useState, useCallback, useEffect } from 'react';
import { useTheme } from '@/contexts/ThemeContext';
import { useGit } from '@/hooks/useGit';
import { isTauri } from '@/lib/tauri';

const COLLAPSED_KEY = 'dwo-source-control-collapsed';

/** Read persisted collapse state (SSR / private-mode safe). */
function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === '1';
  } catch {
    return false;
  }
}

interface GitPanelProps {
  /** Absolute path of the open workspace folder. */
  projectPath?: string;
}

/**
 * VS Code-style "Source Control" section for the Explorer sidebar.
 *
 * Collapsible header with a changed-files count badge, followed by the
 * staged / modified / untracked lists and a commit box. Without a
 * `projectPath` it renders a friendly empty state instead of erroring.
 */
export function GitPanel({ projectPath }: GitPanelProps) {
  const { theme } = useTheme();
  const { status, loading, getStatus, stageFile, unstageFile, commit } = useGit(projectPath);
  const [commitMessage, setCommitMessage] = useState('');
  // SSR-safe: start expanded on BOTH server and client, then hydrate the
  // persisted collapse state after mount. Reading localStorage in the
  // initializer desyncs the trees — the server has no localStorage, so it
  // always fell back to expanded while the client used the stored value.
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    setCollapsed(readCollapsed());
  }, []);

  const toggleCollapsed = useCallback(() => {
    setCollapsed(prev => {
      const next = !prev;
      try {
        localStorage.setItem(COLLAPSED_KEY, next ? '1' : '0');
      } catch {}
      return next;
    });
  }, []);

  const [commitError, setCommitError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!commitMessage.trim()) return;
    setCommitError(null);
    const result = await commit(commitMessage);
    // Only clear the message on actual success — the old code wiped it even
    // when git failed (e.g. missing user.name), losing the user's text.
    if (result?.success) {
      setCommitMessage('');
    } else {
      setCommitError(result?.message || 'Commit failed. Check git config and try again.');
    }
  };

  const changedCount = status
    ? status.modified.length + status.staged.length + status.untracked.length
    : 0;

  return (
    <div style={{ borderTop: `1px solid ${'var(--dwo-color-border)'}` }}>
      {/* Header: caret + title + count badge + refresh */}
      <div
        onClick={toggleCollapsed}
        role="button"
        tabIndex={0}
        aria-expanded={!collapsed}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            toggleCollapsed();
          }
        }}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '6px 8px',
          cursor: 'pointer',
          userSelect: 'none',
          fontSize: '11px',
          fontWeight: 600,
          letterSpacing: '0.05em',
          textTransform: 'uppercase',
          color: 'var(--dwo-color-text-muted)',
        }}
        onMouseEnter={e => { e.currentTarget.style.background = 'var(--dwo-color-bg-tertiary)'; }}
        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
      >
        <span style={{
          display: 'inline-block',
          width: '10px',
          fontSize: '9px',
          transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
          transition: 'transform 0.12s ease',
        }}>
          ▼
        </span>
        <span style={{ flex: 1 }}>Source Control</span>
        {changedCount > 0 && (
          <span style={{
            minWidth: '16px',
            padding: '0 5px',
            borderRadius: '8px',
            background: 'var(--dwo-color-accent)',
            color: '#fff',
            fontSize: '10px',
            lineHeight: '16px',
            textAlign: 'center',
            fontWeight: 600,
          }}>
            {changedCount}
          </span>
        )}
        <button
          onClick={e => {
            e.stopPropagation();
            getStatus();
          }}
          title="Refresh git status"
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--dwo-color-text-muted)',
            cursor: 'pointer',
            fontSize: '11px',
            padding: '0 2px',
            lineHeight: 1,
          }}
        >
          ⟳
        </button>
      </div>

      {/* Body */}
      {!collapsed && (
        <div style={{ padding: '4px 8px 12px' }}>
          {/* No workspace open */}
          {!projectPath && (
            <div style={{
              padding: '8px 4px',
              fontSize: '11px',
              color: 'var(--dwo-color-text-muted)',
              textAlign: 'center',
            }}>
              Open a folder to use Source Control
            </div>
          )}

          {/* Web mode (outside the Tauri shell): degrade quietly */}
          {!!projectPath && !isTauri() && (
            <div style={{
              padding: '8px 4px',
              fontSize: '11px',
              color: 'var(--dwo-color-text-muted)',
              textAlign: 'center',
            }}>
              Source control runs in the DWO desktop app.
            </div>
          )}

          {/* Loading */}
          {projectPath && loading && !status && (
            <div style={{ padding: '8px 4px', fontSize: '11px', color: 'var(--dwo-color-text-muted)' }}>
              Loading git status...
            </div>
          )}

          {/* Loaded status */}
          {projectPath && isTauri() && !!status && (
            <>
              {status.branch && (
                <div style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '3px 8px',
                  background: 'var(--dwo-color-bg-tertiary)',
                  borderRadius: '4px',
                  fontSize: '11px',
                  color: 'var(--dwo-color-text)',
                  marginBottom: '8px',
                }}>
                  <span>🌿</span>
                  <span>{status.branch}</span>
                </div>
              )}

              {changedCount === 0 && (
                <div style={{
                  padding: '6px 4px 10px',
                  fontSize: '11px',
                  color: 'var(--dwo-color-text-muted)',
                }}>
                  No changes
                </div>
              )}

              {/* Staged changes */}
              {status.staged.length > 0 && (
                <div style={{ marginBottom: '10px' }}>
                  <div style={{
                    fontSize: '10px',
                    color: 'var(--dwo-color-text-muted)',
                    marginBottom: '4px',
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                  }}>
                    Staged Changes ({status.staged.length})
                  </div>
                  {status.staged.map(file => (
                    <div key={`staged-${file}`} style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '3px 4px',
                      fontSize: '11px',
                      color: 'var(--dwo-color-text)',
                    }}>
                      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {file}
                      </span>
                      <button
                        onClick={() => unstageFile(file)}
                        title="Unstage this file"
                        style={styles.link(theme)}
                      >
                        Unstage
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Modified files */}
              {status.modified.length > 0 && (
                <div style={{ marginBottom: '10px' }}>
                  <div style={{
                    fontSize: '10px',
                    color: 'var(--dwo-color-text-muted)',
                    marginBottom: '4px',
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                  }}>
                    Changes ({status.modified.length})
                  </div>
                  {status.modified.map(file => (
                    <div key={`modified-${file}`} style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '3px 4px',
                      fontSize: '11px',
                      color: 'var(--dwo-color-text)',
                    }}>
                      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {file}
                      </span>
                      <button
                        onClick={() => stageFile(file)}
                        title="Stage this file"
                        style={styles.link(theme)}
                      >
                        Stage
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Untracked files */}
              {status.untracked.length > 0 && (
                <div style={{ marginBottom: '10px' }}>
                  <div style={{
                    fontSize: '10px',
                    color: 'var(--dwo-color-text-muted)',
                    marginBottom: '4px',
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                  }}>
                    Untracked ({status.untracked.length})
                  </div>
                  {status.untracked.map(file => (
                    <div key={`untracked-${file}`} style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '3px 4px',
                      fontSize: '11px',
                      color: 'var(--dwo-color-text-muted)',
                    }}>
                      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {file}
                      </span>
                      <button
                        onClick={() => stageFile(file)}
                        title="Stage this file"
                        style={styles.link(theme)}
                      >
                        Stage
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Commit input */}
              <div style={{ borderTop: `1px solid ${'var(--dwo-color-border)'}`, paddingTop: '8px' }}>
                {commitError && (
                  <div
                    role="alert"
                    style={{
                      marginBottom: '6px',
                      padding: '6px 8px',
                      background: '#ff6b6b22',
                      border: '1px solid #ff6b6b44',
                      borderRadius: '4px',
                      color: '#ff9999',
                      fontSize: '11px',
                    }}
                  >
                    {commitError}
                  </div>
                )}
                <textarea
                  value={commitMessage}
                  onChange={e => setCommitMessage(e.target.value)}
                  placeholder="Commit message..."
                  rows={2}
                  style={{
                    width: '100%',
                    background: 'var(--dwo-color-bg)',
                    border: `1px solid ${'var(--dwo-color-border)'}`,
                    color: 'var(--dwo-color-text)',
                    padding: '6px',
                    borderRadius: '4px',
                    fontSize: '11px',
                    resize: 'vertical',
                    boxSizing: 'border-box',
                    fontFamily: theme.fonts.sans,
                  }}
                />
                <button
                  onClick={handleSubmit}
                  disabled={!commitMessage.trim()}
                  style={{
                    marginTop: '6px',
                    width: '100%',
                    background: commitMessage.trim() ? 'var(--dwo-color-accent)' : 'var(--dwo-color-bg-tertiary)',
                    color: commitMessage.trim() ? '#fff' : 'var(--dwo-color-text-muted)',
                    border: 'none',
                    padding: '6px',
                    borderRadius: '4px',
                    cursor: commitMessage.trim() ? 'pointer' : 'not-allowed',
                    fontSize: '11px',
                    fontWeight: 500,
                  }}
                >
                  Commit Changes
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

const styles = {
  link: (t: { colors: { accent: string; textMuted: string } }) => ({
    background: 'none',
    border: 'none',
    color: t.colors.accent,
    cursor: 'pointer',
    fontSize: '10px',
    padding: 0,
    flexShrink: 0,
  }),
};
