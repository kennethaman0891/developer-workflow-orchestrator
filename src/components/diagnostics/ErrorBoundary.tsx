'use client';

import { Component, type ErrorInfo, type ReactNode } from 'react';

/**
 * Crash containment for render/lifecycle errors.
 *
 * Without a boundary, a single throwing component tears down the whole React
 * tree — in the IDE that means losing the file tree, tabs and terminal along
 * with the thing that actually failed. This keeps the failure local and gives
 * the user a way back.
 *
 * Reporting goes through `console.error`, which `ErrorReporter` patches at
 * module-eval time and forwards to the `frontend_error` Tauri command, so a
 * caught error reaches the backend log without any extra plumbing here. The
 * component label and React `componentStack` are appended for context.
 */
export interface ErrorBoundaryProps {
  children: ReactNode;
  /** Shown in the default fallback and prefixed to the reported log line. */
  label?: string;
  /** Escape hatch: render your own UI instead of the default fallback. */
  fallback?: (error: Error, reset: () => void) => ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(
      `[ErrorBoundary] ${this.props.label ?? 'view'} crashed: ${error.message}`,
      error,
      info.componentStack ?? '',
    );
  }

  private reset = () => {
    this.setState({ error: null });
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    if (this.props.fallback) return this.props.fallback(error, this.reset);

    const label = this.props.label ?? 'This view';

    return (
      <div
        role="alert"
        data-testid="error-boundary-fallback"
        style={{
          height: '100%',
          minHeight: '160px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px',
          padding: '24px',
          textAlign: 'center',
          fontFamily: 'var(--dwo-font-mono, monospace)',
          background: 'var(--dwo-color-bg, #1e1e1e)',
        }}
      >
        <div style={{ fontSize: '40px' }}>💥</div>
        <div style={{ fontSize: '13px', color: 'var(--dwo-color-error, #f87171)' }}>
          {label} crashed
        </div>
        <div
          style={{
            fontSize: '11px',
            color: 'var(--dwo-color-text-muted, #888)',
            maxWidth: '520px',
            wordBreak: 'break-word',
          }}
        >
          {error.message}
        </div>
        <button
          type="button"
          onClick={this.reset}
          style={{
            marginTop: '4px',
            padding: '6px 14px',
            fontSize: '11px',
            fontFamily: 'inherit',
            color: 'var(--dwo-color-text, #d4d4d4)',
            background: 'var(--dwo-color-surface, #2d2d2d)',
            border: '1px solid var(--dwo-color-border, #444)',
            borderRadius: '4px',
            cursor: 'pointer',
          }}
        >
          Try again
        </button>
      </div>
    );
  }
}
