'use client';

import { useState, useCallback } from 'react';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth, type User } from '@/contexts/AuthContext';
import { GoogleSignInButton } from '@/components/auth/GoogleSignInButton';

interface CollaborationPanelProps {
  workspaceName?: string;
}

export function CollaborationPanel({ workspaceName = 'Current Workspace' }: CollaborationPanelProps) {
  const { theme } = useTheme();
  const {
    currentUser,
    collaborators,
    invitationCode,
    generateInviteCode,
    kickCollaborator,
  } = useAuth();

  const [copied, setCopied] = useState(false);

  // Simulated comments for the UI
  const [comments] = useState<Array<{ id: string; user: string; text: string; resolved: boolean }>>([
    { id: '1', user: 'Sarah Chen', text: 'Consider refactoring this function', resolved: false },
  ]);

  const handleGenerateInvite = useCallback(() => {
    generateInviteCode();
  }, [generateInviteCode]);

  const handleCopyCode = useCallback(() => {
    if (invitationCode) {
      navigator.clipboard.writeText(invitationCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [invitationCode]);

  const allUsers = currentUser ? [currentUser, ...collaborators] : collaborators;
  const onlineCount = allUsers.length;

  return (
    <div style={{ flex: 1, display: 'flex', overflow: 'hidden', background: theme.colors.bg }}>
      {/* Main content */}
      <div style={{ flex: 1, padding: '24px', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {/* Header */}
        <div>
          <h1 style={{ fontSize: '20px', fontWeight: 600, color: theme.colors.text, margin: '0 0 4px 0' }}>
            Collaborative Editing
          </h1>
          <p style={{ fontSize: '13px', color: theme.colors.textMuted, margin: 0 }}>
            Real-time collaboration · {workspaceName}
          </p>
        </div>

        {/* Auth state: Show sign-in CTA or collaborative tools */}
        {!currentUser ? (
          <div style={{
            padding: '32px',
            background: theme.colors.bgSecondary,
            border: `1px solid ${theme.colors.border}`,
            borderRadius: '12px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '16px',
            maxWidth: '480px',
            width: '100%',
            alignSelf: 'center',
          }}>
            <div style={{
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              background: `linear-gradient(135deg, ${theme.colors.accent}, #a78bfa)`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '28px',
            }}>
              👥
            </div>
            <div style={{ textAlign: 'center' }}>
              <h2 style={{ fontSize: '16px', fontWeight: 600, color: theme.colors.text, margin: '0 0 6px 0' }}>
                Sign in to collaborate
              </h2>
              <p style={{ fontSize: '13px', color: theme.colors.textMuted, margin: 0, lineHeight: '1.5' }}>
                Sign in with your Google account to work together in real-time.
                Your changes sync across devices.
              </p>
            </div>
            <GoogleSignInButton size="large" fullWidth />
            <div style={{ fontSize: '11px', color: theme.colors.textMuted, textAlign: 'center', maxWidth: '320px' }}>
              By signing in, you agree to the DWO Terms of Service and Privacy Policy.
            </div>
          </div>
        ) : (
          <>
            {/* Active collaborators */}
            <div>
              <div style={{ fontSize: '12px', color: theme.colors.textMuted, marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Active Collaborators ({onlineCount})
              </div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {allUsers.map(user => (
                  <div key={user.id} style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '6px 10px 6px 6px',
                    background: theme.colors.bgSecondary,
                    border: `1px solid ${theme.colors.border}`,
                    borderRadius: '20px',
                    position: 'relative',
                  }}>
                    <img
                      src={user.avatar && !user.avatar.startsWith('data:') ? user.avatar : getUserAvatar(user)}
                      alt={user.name}
                      style={{
                        width: '24px',
                        height: '24px',
                        borderRadius: '50%',
                        objectFit: 'cover',
                      }}
                    />
                    <span style={{ fontSize: '12px', color: theme.colors.text }}>{user.name}</span>
                    {user.role === 'owner' && (
                      <span style={{
                        fontSize: '9px',
                        background: theme.colors.accent,
                        color: '#fff',
                        padding: '1px 4px',
                        borderRadius: '4px',
                      }}>
                        OWNER
                      </span>
                    )}
                    <span style={{ width: '6px', height: '6px', background: '#4ade80', borderRadius: '50%' }} title="Online" />
                    {/* Kick button for owner */}
                    {currentUser.role === 'owner' && user.id !== currentUser.id && (
                      <button
                        onClick={() => kickCollaborator(user.id)}
                        style={{
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          color: theme.colors.textMuted,
                          padding: '2px',
                          lineHeight: 1,
                          marginLeft: '2px',
                          opacity: 0.5,
                          transition: 'opacity 0.15s',
                        }}
                        onMouseEnter={e => e.currentTarget.style.opacity = '1'}
                        onMouseLeave={e => e.currentTarget.style.opacity = '0.5'}
                        title="Remove collaborator"
                      >
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                          <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                        </svg>
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Invite section */}
            <div style={{
              padding: '16px',
              background: theme.colors.bgSecondary,
              border: `1px solid ${theme.colors.border}`,
              borderRadius: '10px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 500, color: theme.colors.text }}>Invite collaborators</div>
                  <div style={{ fontSize: '11px', color: theme.colors.textMuted, marginTop: '2px' }}>
                    Share this code so others can join your workspace
                  </div>
                </div>
                <button
                  onClick={handleGenerateInvite}
                  style={{
                    background: theme.colors.accent,
                    color: '#fff',
                    border: 'none',
                    padding: '6px 12px',
                    borderRadius: '6px',
                    fontSize: '12px',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = theme.colors.accentHover}
                  onMouseLeave={e => e.currentTarget.style.background = theme.colors.accent}
                >
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path d="M6 1v10M1 6h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                  New Code
                </button>
              </div>

              {invitationCode && (
                <div style={{ display: 'flex', gap: '8px' }}>
                  <div style={{
                    flex: 1,
                    padding: '10px 12px',
                    background: theme.colors.bg,
                    border: `1px solid ${theme.colors.border}`,
                    borderRadius: '6px',
                    fontFamily: 'monospace',
                    fontSize: '16px',
                    fontWeight: 600,
                    color: theme.colors.accent,
                    letterSpacing: '0.1em',
                    textAlign: 'center',
                  }}>
                    {invitationCode}
                  </div>
                  <button
                    onClick={handleCopyCode}
                    style={{
                      padding: '10px 14px',
                      background: theme.colors.bgTertiary,
                      border: `1px solid ${theme.colors.border}`,
                      borderRadius: '6px',
                      color: theme.colors.text,
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      fontSize: '12px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      transition: 'background 0.15s',
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = theme.colors.border}
                    onMouseLeave={e => e.currentTarget.style.background = theme.colors.bgTertiary}
                  >
                    {copied ? (
                      <>
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                          <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        Copied
                      </>
                    ) : (
                      <>
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                          <rect x="3" y="3" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="1.2" />
                          <path d="M9 2H2v7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                        </svg>
                        Copy
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>

            {/* Code editor area */}
            <div style={{
              padding: '16px',
              background: theme.colors.bgSecondary,
              border: `1px solid ${theme.colors.border}`,
              borderRadius: '8px',
              fontFamily: 'monospace',
              fontSize: '13px',
              color: theme.colors.textMuted,
              minHeight: '200px',
              flex: 1,
            }}>
              <div><span style={{ color: '#c678dd' }}>import</span> <span style={{ color: '#e5c07b' }}>React</span> <span style={{ color: '#c678dd' }}>from</span> <span style={{ color: '#98c379' }}>'react'</span>;</div>
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
          </>
        )}
      </div>

      {/* Right sidebar - Comments */}
      <div style={{
        width: '280px',
        borderLeft: `1px solid ${theme.colors.border}`,
        overflow: 'auto',
        padding: '16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
      }}>
        <div style={{ fontSize: '13px', fontWeight: 600, color: theme.colors.text }}>
          Comments ({comments.length})
        </div>

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

        {currentUser && (
          <textarea
            placeholder="Add a comment..."
            rows={3}
            style={{
              width: '100%',
              background: theme.colors.bg,
              border: `1px solid ${theme.colors.border}`,
              color: theme.colors.text,
              padding: '8px',
              borderRadius: '4px',
              fontSize: '11px',
              resize: 'none',
              outline: 'none',
              fontFamily: 'inherit',
              boxSizing: 'border-box',
            }}
          />
        )}

        {!currentUser && (
          <div style={{
            padding: '12px',
            background: theme.colors.bgSecondary,
            border: `1px dashed ${theme.colors.border}`,
            borderRadius: '6px',
            fontSize: '11px',
            color: theme.colors.textMuted,
            textAlign: 'center',
          }}>
            Sign in to leave comments
          </div>
        )}
      </div>
    </div>
  );
}

function getUserAvatar(user: User): string {
  const initials = user.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  const colors = ['#4a9eff', '#f472b6', '#34d399', '#fbbf24', '#a78bfa'];
  const colorIndex = user.email.charCodeAt(0) % colors.length;
  return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" rx="8" fill="${colors[colorIndex]}"/><text x="50%" y="55%" dominant-baseline="middle" text-anchor="middle" font-family="sans-serif" font-size="16" font-weight="600" fill="white">${initials}</text></svg>`)}`;
}
