/**
 * Shell detection utility
 * Determines the user's default shell on the system.
 */

/**
 * Returns the user's default shell path.
 * On macOS, reads from dscl. Falls back to $SHELL or 'zsh'/'bash'.
 */
export function getDefaultShell(): string {
  // Check environment variable first
  if (typeof process !== 'undefined' && process.env.SHELL) {
    return process.env.SHELL;
  }

  // macOS: try dscl to get the user's login shell
  if (typeof navigator !== 'undefined' && navigator.userAgent.includes('Mac')) {
    // In browser context, we can't run dscl directly.
    // Default to zsh which is standard on macOS 12.3+.
    return '/bin/zsh';
  }

  // Fallback: try common shells
  return '/bin/bash';
}

/**
 * Returns a user-friendly shell name for display purposes.
 */
export function getShellName(shellPath: string): string {
  const name = shellPath.split('/').pop() || shellPath;
  return name.replace(/^bin\//, '');
}

/**
 * Detects the current platform.
 */
export function getPlatform(): 'macos' | 'linux' | 'windows' | 'unknown' {
  if (typeof navigator !== 'undefined') {
    const platform = navigator.platform.toLowerCase();
    if (platform.includes('mac')) return 'macos';
    if (platform.includes('win')) return 'windows';
    if (platform.includes('linux')) return 'linux';
  }
  return 'unknown';
}
