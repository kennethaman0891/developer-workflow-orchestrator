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
  // Brightened for dark backgrounds: upstream Solarized greys (#657b83 /
  // #586e75) and dark ruby (#701516) are near-invisible on #0a0a0a–#1e1e1e.
  grey: '#93a1a1',      // Default/generic files
  'grey-light': '#adb8b8', // Ignore files
  green: '#859900',     // YAML, some config files
  orange: '#cb4b16',    // HTML, JSX
  pink: '#d33682',      // SCSS
  purple: '#6c71c4',    // Less
  red: '#dc322f',       // Ruby, tests
  white: '#fdf6e3',     // Standard text files
  yellow: '#b58900',    // JavaScript, JSON data files
  ignore: '#8a9a9e',    // .gitignore, dockerignore
  // Additional color names referenced in definitions.json
  todo: '#e9d10c',      // TODO comments
  heroku: '#fc641d',    // Heroku
  makefile: '#4b8bb9',  // Makefile
  license: '#f6b737',   // License files
  gulp: '#eb4a4b',      // Gulp
  docker: '#0db7ed',    // Docker
  ruby: '#e06c75',      // Ruby (brightened for dark backgrounds)
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

/**
 * Strip executable / event-handler content from third-party SVGs before
 * injecting via dangerouslySetInnerHTML. Filenames are lookup-only (never
 * interpolated), so this is defense-in-depth against a compromised icon pack.
 */
function sanitizeSvg(svg: string): string {
  return svg
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/href\s*=\s*"(?!#)[^"]*"/gi, 'href="#"')
    .replace(/href\s*=\s*'(?!#)[^']*'/gi, "href='#'");
}

/** Convert SVG string to a React element with proper sizing and color */
function svgToReact(svgString: string, color: string, size: number): ReactNode {
  // Inject fill as an attribute (not inline style) so it always wins over any
  // inherited CSS `color` / `fill` rules. Match `<svg`, `<svg ` and `<svg\n`
  // so upstream formatting changes can't slip through unsized.
  const attrs = `fill="${color}" width="${size}" height="${size}"`;
  const sized = /<svg[\s>]/.test(svgString)
    ? svgString.replace(/<svg([\s>])/, `<svg ${attrs}$1`)
    : svgString;
  // Clamp the wrapper so a bad upstream size can't shift tab/tree layout.
  const cleanSvg = sanitizeSvg(sized);

  return (
    <span
      dangerouslySetInnerHTML={{ __html: cleanSvg }}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        verticalAlign: 'middle',
        lineHeight: 1,
        width: size,
        height: size,
        flexShrink: 0,
        overflow: 'hidden',
      }}
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
 * Seti UI folder icon. Open folders render brighter so open/closed states
 * are distinguishable in the file tree.
 */
export function FolderIcon({ expanded = false, size = 14 }: FolderIconProps) {
  const { svg } = themedIcon('folder');
  return svgToReact(svg, expanded ? '#4a9eff' : '#839496', size);
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
