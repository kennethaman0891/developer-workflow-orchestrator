/**
 * VS Code Seti UI Icons — authentic SVG icons from jesseweed/seti-ui
 *
 * Uses the `seti-file-icons` npm package which bundles the original Seti UI
 * icon SVGs exactly as they appear in VS Code's Seti UI extension.
 *
 * This provides the TRUE Seti UI icon shapes and colors, not approximations.
 */

import { getIcon, themeIcons } from 'seti-file-icons';
import type { ReactNode } from 'react';

// ── Seti UI Color Theme (from jesseweed/seti-ui) ─────────────────────────────
// These are the ACTUAL colors used by the Seti UI theme

const SETI_THEME = {
  blue: '#268bd2',      // Python, TypeScript, CSS, Markdown, JSON configs
  grey: '#657b83',      // Default/generic files
  'grey-light': '#839496', // Ignore files
  green: '#859900',     // YAML, some config files
  orange: '#cb4b16',    // HTML, JSX
  pink: '#d33682',      // SCSS
  purple: '#6c71c4',    // Less
  red: '#dc322f',       // Ruby, tests
  white: '#fdf6e3',     // Standard text files
  yellow: '#b58900',    // JavaScript, JSON data files
  ignore: '#586e75',    // .gitignore, dockerignore
  // Additional color names referenced in definitions.json
  todo: '#e9d10c',      // TODO comments
  heroku: '#fc641d',    // Heroku
  makefile: '#4b8bb9',  // Makefile
  license: '#f6b737',   // License files
  gulp: '#eb4a4b',      // Gulp
  docker: '#0db7ed',    // Docker
  ruby: '#701516',      // Ruby (explicit override)
  hex: '#9876aa',       // Hex/color files
} as const;

// Initialize themed icon getter with Seti UI colors
const getThemedIcon = themeIcons(SETI_THEME);

/**
 * Themed icon lookup with a grey fallback for any color key that the
 * definitions resolve to but this theme doesn't define.
 */
function themedIcon(fileName: string): { svg: string; color: string } {
  const { svg, color } = getThemedIcon(fileName);
  return { svg, color: color ?? SETI_THEME.grey };
}

// ── Helper: Render SVG string to React node safely ────────────────────────────

/** Convert SVG string to a React element with proper sizing and color */
function svgToReact(svgString: string, color: string, size: number): ReactNode {
  // Inject fill as an attribute (not inline style) so it always wins over any
  // inherited CSS `color` / `fill` rules. We replace only the opening <svg tag
  // and add fill + explicit width/height attributes.
  const attrs = `fill="${color}" width="${size}" height="${size}"`;
  const cleanSvg = svgString.replace(/<svg /, `<svg ${attrs} `);

  return (
    <span
      dangerouslySetInnerHTML={{ __html: cleanSvg }}
      style={{ display: 'inline-block', verticalAlign: 'middle', lineHeight: 1 }}
    />
  );
}

// ── Public Components ─────────────────────────────────────────────────────────

export interface FileIconProps {
  /** File path to determine icon (e.g., "src/components/FileBrowser.tsx") */
  path: string;
  /** Icon size in pixels (default: 14) */
  size?: number;
}

/**
 * Authentic Seti UI file icon based on file extension.
 * Returns the correct colored SVG icon for any file type.
 */
export function FileIcon({ path, size = 14 }: FileIconProps) {
  const { svg, color } = themedIcon(path);
  return svgToReact(svg, color, size);
}

export interface FolderIconProps {
  expanded?: boolean;
  size?: number;
}

/**
 * Seti UI folder icon.
 * Closed folders use the 'folder' icon (white/teal).
 * Open folders also use 'folder' but visually distinct via context.
 */
export function FolderIcon({ expanded = false, size = 14 }: FolderIconProps) {
  // Both closed and open folders use the same 'folder' icon in Seti UI
  // The visual distinction comes from color (closed = teal, open = blue)
  const { svg, color } = themedIcon('folder');
  return svgToReact(svg, color, size);
}

export interface ChevronProps {
  size?: number;
}

/** Chevron-right for collapsed tree nodes */
export function ChevronRight({ size = 12 }: ChevronProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 10 16" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <path d="M4.2 0L2.8 1.4l4.6 4.6-4.6 4.6 1.4 1.4 6-6z" />
    </svg>
  );
}

/** Chevron-down for expanded tree nodes */
export function ChevronDown({ size = 12 }: ChevronProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 10 16" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <path d="M0 4.2l6 6 6-6-1.4-1.4-4.6 4.6-4.6-4.6z" />
    </svg>
  );
}

export interface LargePlaceholderProps {
  type: 'folder' | 'file' | 'pdf';
}

/**
 * Large 48px placeholder icon for IDE empty states.
 */
export function LargePlaceholder({ type }: LargePlaceholderProps) {
  const size = 48;
  let iconName = 'default';

  switch (type) {
    case 'folder':
      iconName = 'folder';
      break;
    case 'pdf':
      iconName = 'pdf';
      break;
    default:
      iconName = 'default';
  }

  const { svg, color } = themedIcon(iconName);
  return <div style={{ display: 'flex', justifyContent: 'center' }}>{svgToReact(svg, color, size)}</div>;
}

// ── End of public API ────────────────────────────────────────────────────────
