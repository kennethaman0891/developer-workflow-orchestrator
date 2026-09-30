'use client';

import { useState, useCallback } from 'react';
import type { SessionMeta } from '@/hooks/useTerminals';
import type { SessionSummary } from '@/lib/terminal';
import { useTerminalHandoff } from '@/hooks/useTerminalHandoff';
import { isTauri } from '@/lib/tauri';

interface HandoffPanelProps {
  sessions: SessionMeta[];
  activeId: string | null;
  onClose: () => void;
}

function formatTimeAgo(dateStr: string): string {
  const date = new Date(dateStr);
  const diffMs = Date.now() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHrs = Math.floor(diffMins / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  return `${Math.floor(diffHrs / 24)}d ago`;
}

export function HandoffPanel({ sessions, activeId, onClose }: HandoffPanelProps) {
  const { artifacts, capture, inject, remove, getArtifact, selected, setSelected } =
    useTerminalHandoff();
  const [showView, setShowView] = useState<string | null>(null);
  const [injecting, setInjecting] = useState<string | null>(null);
  const [injected, setInjected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showCaptureNotes, setShowCaptureNotes] = useState(false);
  const [captureNotes, setCaptureNotes] = useState('');
  const [captureTitle, setCaptureTitle] = useState('');
  /** Per-artifact target selection (defaults to primaryTarget until chosen). */
  const [targetIds, setTargetIds] = useState<Record<string, string>>({});

  const primaryTarget = activeId || sessions[0]?.id || '';

  // Web mode has no PTY backend — hide the panel content gracefully.
  if (!isTauri()) return null;

  const handleCapture = useCallback(async () => {
    if (!activeId) return;
    const title = captureTitle.trim() || `Terminal ${activeId.slice(0, 6)}`;
    const result = await capture(activeId, title, captureNotes.trim() || undefined);
    setCaptureTitle('');
    setCaptureNotes('');
    setShowCaptureNotes(false);
    setError(result ? null : 'Failed to capture terminal context');
  }, [activeId, captureTitle, captureNotes, capture]);

  const handleInject = useCallback(async (artifactId: string, targetId: string) => {
    if (!targetId) return;
    setError(null);
    setInjecting(artifactId);
    const failure = await inject(targetId, artifactId);
    setInjecting(null);
    if (failure === null) {
      setInjected(artifactId);
      setTimeout(() => setInjected(null), 2000);
    } else {
      setError(failure);
    }
  }, [inject]);

  const handleDelete = useCallback((artifactId: string) => {
    remove(artifactId);
    if (showView === artifactId) setShowView(null);
  }, [remove, showView]);

  const handleView = useCallback(async (artifact: SessionSummary) => {
    setError(null);
    const full = await getArtifact(artifact.id);
    if (full) {
      setSelected(full);
      setShowView(showView === artifact.id ? null : artifact.id);
    } else {
      setError('Could not load artifact content');
    }
  }, [getArtifact, showView, setSelected]);

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      right: 0,
      bottom: 0,
      width: '320px',
      background: '#111111',
      borderLeft: '1px solid #2a2a2a',
      display: 'flex',
      flexDirection: 'column',
      zIndex: 60,
      boxShadow: '-4px 0 12px rgba(0,0,0,0.4)',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '8px 12px',
        borderBottom: '1px solid #2a2a2a',
        background: '#0a0a0a',
      }}>
        <span style={{ fontSize: '13px', fontWeight: 500, color: '#e8e8e8' }}>
          ⚡ Session Handoff
        </span>
        <button
          onClick={onClose}
          title="Close handoff panel"
          style={{
            background: 'transparent',
            border: 'none',
            color: '#888',
            cursor: 'pointer',
            fontSize: '16px',
            padding: '2px 4px',
            borderRadius: '3px',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = '#e8e8e8'; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = '#888'; }}
        >
          ✕
        </button>
      </div>

      {error && (
        <div style={{
          padding: '6px 12px',
          background: '#ff6b6b22',
          borderBottom: '1px solid #ff6b6b44',
          color: '#ff9999',
          fontSize: '11px',
        }}>
          {error}
        </div>
      )}

      {/* Capture section */}
      <div style={{ padding: '10px 12px', borderBottom: '1px solid #2a2a2a' }}>
        {!showCaptureNotes ? (
          <button
            onClick={() => setShowCaptureNotes(true)}
            style={{
              width: '100%',
              background: '#4a9eff22',
              border: '1px solid #4a9eff44',
              color: '#4a9eff',
              padding: '6px 10px',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: 500,
            }}
          >
            + Capture Active Terminal
          </button>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <input
              value={captureTitle}
              onChange={(e) => setCaptureTitle(e.target.value)}
              placeholder="Title (optional)"
              style={{
                background: '#1a1a1a',
                border: '1px solid #2a2a2a',
                color: '#e8e8e8',
                padding: '4px 8px',
                borderRadius: '3px',
                fontSize: '12px',
                outline: 'none',
              }}
            />
            <textarea
              value={captureNotes}
              onChange={(e) => setCaptureNotes(e.target.value)}
              placeholder="Notes for the next terminal (optional)"
              rows={2}
              style={{
                background: '#1a1a1a',
                border: '1px solid #2a2a2a',
                color: '#e8e8e8',
                padding: '4px 8px',
                borderRadius: '3px',
                fontSize: '12px',
                resize: 'vertical',
                outline: 'none',
              }}
            />
            <div style={{ display: 'flex', gap: '6px' }}>
              <button
                onClick={handleCapture}
                disabled={!activeId}
                style={{
                  flex: 1,
                  background: activeId ? '#4a9eff' : '#333',
                  border: 'none',
                  color: '#fff',
                  padding: '4px 8px',
                  borderRadius: '3px',
                  cursor: activeId ? 'pointer' : 'not-allowed',
                  fontSize: '11px',
                }}
              >
                Capture
              </button>
              <button
                onClick={() => { setShowCaptureNotes(false); setCaptureTitle(''); setCaptureNotes(''); }}
                style={{
                  background: 'transparent',
                  border: '1px solid #2a2a2a',
                  color: '#888',
                  padding: '4px 8px',
                  borderRadius: '3px',
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

      {/* Artifacts list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 12px' }}>
        <div style={{ fontSize: '11px', color: '#666', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Captured sessions ({artifacts.length})
        </div>

        {artifacts.length === 0 ? (
          <div style={{ color: '#555', fontSize: '12px', textAlign: 'center', padding: '20px 0' }}>
            No captured sessions yet.
            <br />
            <span style={{ fontSize: '11px' }}>Capture a terminal to get started.</span>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {artifacts.map((artifact) => (
              <div key={artifact.id} style={{
                background: '#1a1a1a',
                border: '1px solid #2a2a2a',
                borderRadius: '6px',
                padding: '8px',
              }}>
                <div style={{
                  fontSize: '12px',
                  color: '#e8e8e8',
                  fontWeight: 500,
                  marginBottom: '2px',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  ● {artifact.title}
                </div>
                <div style={{ fontSize: '11px', color: '#666', marginBottom: '4px' }}>
                  {formatTimeAgo(artifact.created_at)} · {artifact.line_count} lines · cwd {artifact.cwd}
                </div>
                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '6px' }}>
                  {sessions.length > 0 ? (
                    (() => {
                      const targetId = targetIds[artifact.id] || primaryTarget;
                      const target = sessions.find((s) => s.id === targetId);
                      const targetIsTui = !!target?.is_tui;
                      return (
                        <>
                          <select
                            value={targetId}
                            onChange={(e) => setTargetIds((prev) => ({ ...prev, [artifact.id]: e.target.value }))}
                            disabled={injecting === artifact.id}
                            title="Pick the target terminal — nothing happens until you press Inject"
                            style={{
                              flex: 1,
                              minWidth: 0,
                              background: '#0a0a0a',
                              border: '1px solid #2a2a2a',
                              color: '#aaa',
                              padding: '2px 4px',
                              borderRadius: '3px',
                              fontSize: '11px',
                              cursor: 'pointer',
                              outline: 'none',
                            }}
                          >
                            {sessions.map((s) => (
                              <option key={s.id} value={s.id}>
                                → {s.title}{s.is_tui ? ' (TUI)' : ''}
                              </option>
                            ))}
                          </select>
                          <button
                            onClick={() => handleInject(artifact.id, targetId)}
                            disabled={injecting === artifact.id || targetIsTui || !targetId}
                            title={
                              targetIsTui
                                ? 'Target is a TUI session — pick a plain shell terminal'
                                : `Inject into ${target?.title ?? 'terminal'}`
                            }
                            style={{
                              background: injecting === artifact.id ? '#4a9eff66' : targetIsTui ? '#333' : '#4a9eff22',
                              border: targetIsTui ? '1px solid #2a2a2a' : '1px solid #4a9eff44',
                              color: targetIsTui ? '#555' : '#4a9eff',
                              padding: '2px 6px',
                              borderRadius: '3px',
                              cursor: injecting === artifact.id ? 'wait' : targetIsTui ? 'not-allowed' : 'pointer',
                              fontSize: '11px',
                              fontWeight: 500,
                            }}
                          >
                            {injecting === artifact.id ? '…' : 'Inject'}
                          </button>
                        </>
                      );
                    })()
                  ) : (
                    <div style={{ fontSize: '11px', color: '#666', flex: 1 }}>No terminals open</div>
                  )}
                  <button
                    onClick={() => handleView(artifact)}
                    style={{
                      background: 'transparent',
                      border: '1px solid #2a2a2a',
                      color: '#888',
                      padding: '2px 6px',
                      borderRadius: '3px',
                      cursor: 'pointer',
                      fontSize: '11px',
                    }}
                  >
                    View
                  </button>
                  <button
                    onClick={() => handleDelete(artifact.id)}
                    style={{
                      background: 'transparent',
                      border: '1px solid #2a2a2a',
                      color: '#ff6b6b',
                      padding: '2px 6px',
                      borderRadius: '3px',
                      cursor: 'pointer',
                      fontSize: '11px',
                    }}
                  >
                    Delete
                  </button>
                </div>
                {injected === artifact.id && (
                  <div style={{ fontSize: '11px', color: '#4ade80', marginTop: '4px' }}>
                    ✓ Injected
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Scrollback viewer overlay */}
      {selected && showView === selected.id && (
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: '#0a0a0a',
          zIndex: 10,
          display: 'flex',
          flexDirection: 'column',
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '8px 12px',
            borderBottom: '1px solid #2a2a2a',
          }}>
            <span style={{ fontSize: '12px', color: '#e8e8e8', fontWeight: 500 }}>
              {selected.title}
            </span>
            <button
              onClick={() => setShowView(null)}
              style={{ background: 'transparent', border: 'none', color: '#888', cursor: 'pointer', fontSize: '14px' }}
            >
              ✕
            </button>
          </div>
          <div style={{ flex: 1, overflow: 'auto', padding: '8px 12px' }}>
            <pre style={{
              fontSize: '11px',
              color: '#aaa',
              fontFamily: 'monospace',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
              margin: 0,
              lineHeight: 1.5,
            }}>
              {selected.scrollback.join('\n') || '(no scrollback captured)'}
            </pre>
          </div>
          {selected.notes && (
            <div style={{
              padding: '8px 12px',
              borderTop: '1px solid #2a2a2a',
              background: '#111111',
            }}>
              <div style={{ fontSize: '11px', color: '#4a9eff', marginBottom: '4px' }}>Notes:</div>
              <div style={{ fontSize: '12px', color: '#ccc' }}>{selected.notes}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
