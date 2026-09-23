'use client';

import { useState } from 'react';
import { useTheme } from '@/contexts/ThemeContext';

interface User {
  id: string;
  name: string;
  avatar: string;
  online: boolean;
}

export function CollaborationPanel() {
  const { theme } = useTheme();
  const [users] = useState<User[]>([
    { id: '1', name: 'Kenneth Aman', avatar: '👤', online: true },
    { id: '2', name: 'Sarah Chen', avatar: '👩‍💻', online: true },
    { id: '3', name: 'Mike Johnson', avatar: '👨‍💻', online: false },
  ]);

  const [comments] = useState<Array<{ id: string; user: string; text: string; resolved: boolean }>>([
    { id: '1', user: 'Sarah Chen', text: 'Consider refactoring this function', resolved: false },
  ]);

  return (
    <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
      {/* Main content */}
      <div style={{ flex: 1, padding: '24px', overflow: 'auto' }}>
        <div style={{ marginBottom: '24px' }}>
          <h1 style={{ fontSize: '20px', fontWeight: 600, color: theme.colors.text, margin: '0 0 8px 0' }}>
            Collaborative Editing
          </h1>
          <p style={{ fontSize: '13px', color: theme.colors.textMuted, margin: 0 }}>
            Real-time collaboration with your team
          </p>
        </div>

        {/* Active collaborators */}
        <div style={{ marginBottom: '24px' }}>
          <div style={{ fontSize: '12px', color: theme.colors.textMuted, marginBottom: '12px' }}>Active Collaborators</div>
          <div style={{ display: 'flex', gap: '8px' }}>
            {users.filter(u => u.online).map(user => (
              <div key={user.id} style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 12px',
                background: theme.colors.bgSecondary,
                border: `1px solid ${theme.colors.border}`,
                borderRadius: '20px',
              }}>
                <span style={{ fontSize: '16px' }}>{user.avatar}</span>
                <span style={{ fontSize: '12px', color: theme.colors.text }}>{user.name}</span>
                <span style={{ width: '6px', height: '6px', background: '#4ade80', borderRadius: '50%' }} />
              </div>
            ))}
          </div>
        </div>

        {/* Code area placeholder */}
        <div style={{
          padding: '16px',
          background: theme.colors.bg,
          border: `1px solid ${theme.colors.border}`,
          borderRadius: '8px',
          fontFamily: 'monospace',
          fontSize: '13px',
          color: theme.colors.textMuted,
          minHeight: '200px',
        }}>
          <div><span style={{ color: '#c678dd' }}>import</span> <span style={{ color: '#e5c07b' }}>{'React'}</span> <span style={{ color: '#c678dd' }}>from</span> <span style={{ color: '#98c379' }}>'react'</span>;</div>
          <div></div>
          <div><span style={{ color: '#c678dd' }}>export default function</span> <span style={{ color: '#61afef' }}>App</span>() {'{'} //</div>
          <div style={{ position: 'relative' }}>
            <span style={{ color: theme.colors.text }}>  // Collaborative editing in progress...</span>
            <div style={{
              position: 'absolute',
              left: '100%',
              top: 0,
              width: '8px',
              height: '16px',
              background: '#e06c75',
              animation: 'blink 1s infinite',
            }} />
          </div>
          <div>{'}'}</div>
        </div>
      </div>

      {/* Comments sidebar */}
      <div style={{
        width: '280px',
        borderLeft: `1px solid ${theme.colors.border}`,
        overflow: 'auto',
        padding: '16px',
      }}>
        <div style={{ fontSize: '13px', fontWeight: 600, color: theme.colors.text, marginBottom: '12px' }}>
          Comments ({comments.length})
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {comments.map(comment => (
            <div key={comment.id} style={{
              padding: '12px',
              background: theme.colors.bgSecondary,
              border: `1px solid ${theme.colors.border}`,
              borderRadius: '6px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                <span style={{ fontSize: '11px', fontWeight: 500, color: theme.colors.text }}>{comment.user}</span>
                {!comment.resolved && <span style={{ fontSize: '9px', color: theme.colors.accent }}>OPEN</span>}
              </div>
              <div style={{ fontSize: '11px', color: theme.colors.textMuted }}>{comment.text}</div>
            </div>
          ))}
        </div>
        <textarea
          placeholder="Add a comment..."
          rows={3}
          style={{
            marginTop: '12px',
            width: '100%',
            background: theme.colors.bg,
            border: `1px solid ${theme.colors.border}`,
            color: theme.colors.text,
            padding: '8px',
            borderRadius: '4px',
            fontSize: '11px',
            resize: 'none',
            boxSizing: 'border-box',
          }}
        />
      </div>
    </div>
  );
}
