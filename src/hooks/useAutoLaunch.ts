'use client';

/**
 * useAutoLaunch — Automatically launches a CLI command in every terminal pane
 * of a workspace after they reach a prompt.
 *
 * Behavior:
 * 1. Waits for all terminals to be created (scaled delay: min(1500, 500 + n*120) ms)
 * 2. Pre-resizes each PTY to the exact grid cell dimensions
 * 3. Sends the command (staggered ~200ms apart)
 * 4. Sets TUI mode on the sessions for auto-expand detection
 */

import { useCallback, useRef } from 'react';
import { terminalSendCommand, terminalResize, terminalSetTui } from '@/lib/terminal';

interface AutoLaunchOptions {
  /** The command to auto-launch in each pane */
  command: string;
  /** Session IDs to launch in (one per pane) */
  sessionIds: string[];
  /** Whether auto-launch is enabled */
  enabled: boolean;
}

export interface PaneDimensions {
  sessionId: string;
  cols: number;
  rows: number;
}

/**
 * Compute expected PTY dimensions from a CSS pixel rectangle.
 * Standard: ~8px per char width, ~16px per row height (with 13px font).
 */
function computePtyDimensions(
  pixelWidth: number,
  pixelHeight: number,
  fontSize: number = 13,
): { cols: number; rows: number } {
  const charWidth = fontSize * 0.65;
  const lineHeight = fontSize * 1.2;
  return {
    cols: Math.max(20, Math.floor(pixelWidth / charWidth)),
    rows: Math.max(5, Math.floor(pixelHeight / lineHeight)),
  };
}

export function useAutoLaunch() {
  const launchedRef = useRef<Set<string>>(new Set());

  const autoLaunch = useCallback(async (options: AutoLaunchOptions) => {
    const { command, sessionIds, enabled } = options;
    if (!enabled || !command || sessionIds.length === 0) return;

    const n = sessionIds.length;
    // Scaled delay before first launch: min(1500, 500 + n*120) ms
    const baseDelay = Math.min(1500, 500 + n * 120);

    await new Promise(resolve => setTimeout(resolve, baseDelay));

    for (let i = 0; i < sessionIds.length; i++) {
      const sessionId = sessionIds[i];

      // Skip if already launched in a previous render cycle
      if (launchedRef.current.has(sessionId)) continue;
      launchedRef.current.add(sessionId);

      // Stagger: ~200ms between launches
      if (i > 0) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }

      try {
        // Send the command to the PTY
        await terminalSendCommand(sessionId, command);
        // Mark as TUI so layout can auto-expand
        await terminalSetTui(sessionId, true);
      } catch (error) {
        console.error(`[useAutoLaunch] Failed to launch in ${sessionId}:`, error);
      }
    }
  }, []);

  /** Clear the launched tracking (e.g. on workspace change) */
  const resetLaunched = useCallback(() => {
    launchedRef.current.clear();
  }, []);

  /** Compute and apply pre-resize for a set of panes before auto-launch */
  const preResizePanes = useCallback(async (
    dimensions: PaneDimensions[],
  ) => {
    for (const { sessionId, cols, rows } of dimensions) {
      try {
        await terminalResize(sessionId, cols, rows);
      } catch (error) {
        console.error(`[useAutoLaunch] Failed to pre-resize ${sessionId}:`, error);
      }
    }
  }, []);

  return {
    autoLaunch,
    resetLaunched,
    preResizePanes,
    computePtyDimensions,
  };
}
