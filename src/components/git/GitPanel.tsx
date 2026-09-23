'use client';

import { useState } from 'react';
import { useTheme } from '@/contexts/ThemeContext';
import { useGit } from '@/hooks/useGit';

export function GitPanel() {
  const { theme } = useTheme();
  const { status, loading, stageFile, commit } = useGit();
  const [commitMessage, setCommitMessage] = useState('');

  const handleSubmit = async () => {
    if (!commitMessage.trim()) return;
    await commit(commitMessage);
    setCommitMessage('');
  };

  if (loading) {
    return (
      <div style={{ padding: '16px', color: theme.colors.textMuted, fontSize: '12px' }}>
        Loading git status...
      </div>
    );
  }

  return (
    <div style={{ padding: '16px' }}>
      <div style={{ fontSize: '14px', fontWeight: 600, color: theme.colors.text, marginBottom: '12px' }}>
        Git Status
      </div>

      {status?.branch && (
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          padding: '4px 8px',
          background: theme.colors.bgTertiary,
          borderRadius: '4px',
          fontSize: '12px',
          marginBottom: '12px',
        }}>
          <span>🌿</span>
          <span>{status.branch}</span>
        </div>
      )}

      {/* Staged changes */}
      {status?.staged && status.staged.length > 0 && (
        <div style={{ marginBottom: '12px' }}>
          <div style={{ fontSize: '11px', color: theme.colors.textMuted, marginBottom: '6px' }}>Staged Changes</div>
          {status.staged.map(file => (
            <div key={file} style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '4px 8px',
              fontSize: '11px',
              color: theme.colors.accent,
            }}>
              <span>📄</span>
              <span>{file}</span>
              <button onClick={() => stageFile(file)} style={styles.unlink(theme)}>Unstage</button>
            </div>
          ))}
        </div>
      )}

      {/* Modified files */}
      {status?.modified && status.modified.length > 0 && (
        <div style={{ marginBottom: '12px' }}>
          <div style={{ fontSize: '11px', color: theme.colors.textMuted, marginBottom: '6px' }}>Modified</div>
          {status.modified.map(file => (
            <div key={file} style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '4px 8px',
              fontSize: '11px',
              color: theme.colors.text,
            }}>
              <span>📝</span>
              <span>{file}</span>
              <button onClick={() => stageFile(file)} style={styles.link(theme)}>Stage</button>
            </div>
          ))}
        </div>
      )}

      {/* Untracked files */}
      {status?.untracked && status.untracked.length > 0 && (
        <div style={{ marginBottom: '12px' }}>
          <div style={{ fontSize: '11px', color: theme.colors.textMuted, marginBottom: '6px' }}>Untracked</div>
          {status.untracked.map(file => (
            <div key={file} style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '4px 8px',
              fontSize: '11px',
              color: theme.colors.textMuted,
            }}>
              <span>❓</span>
              <span>{file}</span>
              <button onClick={() => stageFile(file)} style={styles.link(theme)}>Stage</button>
            </div>
          ))}
        </div>
      )}

      {/* Commit input */}
      <div style={{ borderTop: `1px solid ${theme.colors.border}`, paddingTop: '12px' }}>
        <textarea
          value={commitMessage}
          onChange={e => setCommitMessage(e.target.value)}
          placeholder="Commit message..."
          rows={3}
          style={{
            width: '100%',
            background: theme.colors.bg,
            border: `1px solid ${theme.colors.border}`,
            color: theme.colors.text,
            padding: '8px',
            borderRadius: '4px',
            fontSize: '12px',
            resize: 'vertical',
            boxSizing: 'border-box',
          }}
        />
        <button
          onClick={handleSubmit}
          disabled={!commitMessage.trim()}
          style={{
            marginTop: '8px',
            width: '100%',
            background: commitMessage.trim() ? theme.colors.accent : theme.colors.bgTertiary,
            color: commitMessage.trim() ? '#fff' : theme.colors.textMuted,
            border: 'none',
            padding: '8px',
            borderRadius: '4px',
            cursor: commitMessage.trim() ? 'pointer' : 'not-allowed',
            fontSize: '12px',
            fontWeight: 500,
          }}
        >
          Commit Changes
        </button>
      </div>
    </div>
  );
}

const styles = {
  link: (t: any) => ({
    background: 'none',
    border: 'none',
    color: t.colors.accent,
    cursor: 'pointer',
    fontSize: '10px',
    padding: 0,
  }),
  unlink: (t: any) => ({
    background: 'none',
    border: 'none',
    color: t.colors.textMuted,
    cursor: 'pointer',
    fontSize: '10px',
    padding: 0,
  }),
};
