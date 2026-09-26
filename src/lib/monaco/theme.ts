/**
 * Bridge between DWO's own theme tokens (`src/lib/themes.ts`) and Monaco themes.
 *
 * The IDE previously hardcoded `#1e1e1e`/`#2a2a2a`, which matched neither of the
 * two theme systems in the app. This module derives one Monaco theme per DWO
 * theme so the editor, sidebar, terminal and status bar stay visually coherent.
 */

import type { editor } from 'monaco-editor';
import { themes, type ThemeKey, type ThemeTokens } from '@/lib/themes';

export type MonacoNamespace = typeof import('monaco-editor');

/** Monaco theme name prefix — full name is `dwo-<themeKey>`. */
const THEME_PREFIX = 'dwo-';

const HEX_RE = /^#[0-9a-f]{6}$/i;

/** Normalise any hex colour to `#rrggbb` (Monaco rejects `#rgb` and alpha in rules). */
function toHex6(value: string): string {
  const v = value.trim();
  if (HEX_RE.test(v)) return v.toLowerCase();
  if (/^#[0-9a-f]{3}$/i.test(v)) {
    const [, r, g, b] = v;
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  // Unrecognised input — fall back to a neutral grey rather than throwing.
  return '#c0c0c0';
}

/** Append an alpha channel (`#rrggbb` + 2 hex digits) for translucent editor colours. */
function withAlpha(hex: string, alpha: number): string {
  const a = Math.round(Math.max(0, Math.min(1, alpha)) * 255);
  return `${toHex6(hex)}${a.toString(16).padStart(2, '0')}`;
}

function buildRules(t: ThemeTokens): editor.ITokenThemeRule[] {
  const { text, textMuted, accent, accentHover, success, warning } = t.colors;
  const base = toHex6(text);
  const muted = toHex6(textMuted);

  return [
    { token: '', foreground: base },
    { token: 'comment', foreground: muted, fontStyle: 'italic' },
    { token: 'keyword', foreground: toHex6(accent) },
    { token: 'keyword.control', foreground: toHex6(accent) },
    { token: 'string', foreground: toHex6(success) },
    { token: 'string.escape', foreground: toHex6(accentHover) },
    { token: 'number', foreground: toHex6(warning) },
    { token: 'regexp', foreground: toHex6(warning) },
    { token: 'type', foreground: toHex6(accentHover) },
    { token: 'type.identifier', foreground: toHex6(accentHover) },
    { token: 'namespace', foreground: toHex6(accentHover) },
    { token: 'identifier', foreground: base },
    { token: 'delimiter', foreground: muted },
    { token: 'operator', foreground: muted },
    { token: 'attribute.name', foreground: toHex6(accent) },
    { token: 'attribute.value', foreground: toHex6(success) },
    { token: 'tag', foreground: toHex6(accent) },
    { token: 'variable', foreground: base },
    { token: 'variable.predefined', foreground: toHex6(accentHover) },
    { token: 'annotation', foreground: toHex6(warning) },
    { token: 'metatag', foreground: toHex6(accent) },
    { token: 'constant', foreground: toHex6(warning) },
  ];
}

function buildColors(t: ThemeTokens): editor.IColors {
  const { bg, bgSecondary, bgTertiary, text, textMuted, accent, border, success, warning, error } =
    t.colors;

  return {
    'editor.background': bg,
    'editor.foreground': text,
    'editor.lineHighlightBackground': withAlpha(bgSecondary, 0.6),
    'editor.lineHighlightBorder': withAlpha(border, 0.4),
    'editorLineNumber.foreground': textMuted,
    'editorLineNumber.activeForeground': text,
    'editorCursor.foreground': accent,
    'editor.selectionBackground': withAlpha(accent, 0.35),
    'editor.inactiveSelectionBackground': withAlpha(accent, 0.18),
    'editor.rangeHighlightBackground': withAlpha(accent, 0.12),
    'editor.selectionHighlightBackground': withAlpha(accent, 0.12),
    'editor.wordHighlightBackground': withAlpha(accent, 0.12),
    'editor.wordHighlightStrongBackground': withAlpha(accent, 0.2),
    'editor.findMatchBackground': withAlpha(warning, 0.4),
    'editor.findMatchHighlightBackground': withAlpha(warning, 0.24),
    'editor.rangeHighlight': withAlpha(accent, 0.1),
    'editorWhitespace.foreground': withAlpha(border, 0.9),
    'editorIndentGuide.background1': withAlpha(border, 0.9),
    'editorIndentGuide.activeBackground1': textMuted,
    'editorRuler.foreground': border,
    'editorCodeLens.foreground': textMuted,
    'editorBracketMatch.background': withAlpha(accent, 0.2),
    'editorBracketMatch.border': accent,
    'editorGutter.background': bg,
    'editorGutter.addedBackground': success,
    'editorGutter.deletedBackground': error,
    'editorGutter.modifiedBackground': warning,
    'editorOverviewRuler.border': border,
    'editorWidget.background': bgSecondary,
    'editorWidget.border': border,
    'editorSuggestWidget.background': bgSecondary,
    'editorSuggestWidget.border': border,
    'editorSuggestWidget.foreground': text,
    'editorSuggestWidget.selectedBackground': bgTertiary,
    'editorSuggestWidget.highlightForeground': accent,
    'editorHoverWidget.background': bgSecondary,
    'editorHoverWidget.border': border,
    'editorHoverWidget.foreground': text,
    'editorError.foreground': error,
    'editorWarning.foreground': warning,
    'editorInfo.foreground': accent,
    'problemsErrorIcon.foreground': error,
    'problemsWarningIcon.foreground': warning,
    'problemsInfoIcon.foreground': accent,
    'editorMarkerNavigationError.background': error,
    'editorMarkerNavigationWarning.background': warning,
    'diffEditor.insertedTextBackground': withAlpha(success, 0.2),
    'diffEditor.removedTextBackground': withAlpha(error, 0.2),
    'minimap.background': bg,
    'minimapSlider.background': withAlpha(text, 0.08),
    'minimapSlider.hoverBackground': withAlpha(text, 0.14),
    'scrollbarSlider.background': withAlpha(text, 0.1),
    'scrollbarSlider.hoverBackground': withAlpha(text, 0.18),
    'scrollbarSlider.activeBackground': withAlpha(text, 0.26),
    'panel.background': bg,
    'panel.border': border,
    'panelTitle.activeBorder': accent,
    'panelTitle.activeForeground': text,
    'panelTitle.inactiveForeground': textMuted,
    'statusBar.background': bgSecondary,
    'statusBar.foreground': text,
    'statusBar.border': border,
    'statusBar.debuggingBackground': warning,
    'statusBar.debuggingForeground': bg,
    'statusBarItem.hoverBackground': bgTertiary,
    'titleBar.activeBackground': bg,
    'titleBar.activeForeground': text,
    'titleBar.inactiveForeground': textMuted,
    'titleBar.border': border,
    'activityBar.background': bg,
    'activityBar.foreground': text,
    'activityBar.inactiveForeground': textMuted,
    'activityBar.border': border,
    'activityBar.activeBorder': accent,
    'sideBar.background': bg,
    'sideBar.foreground': text,
    'sideBar.border': border,
    'sideBarSectionHeader.background': bgSecondary,
    'sideBarSectionHeader.foreground': text,
    'sideBarTitle.foreground': text,
    'list.hoverBackground': bgTertiary,
    'list.activeSelectionBackground': bgTertiary,
    'list.activeSelectionForeground': text,
    'list.inactiveSelectionBackground': bgTertiary,
    'list.highlightForeground': accent,
    'list.focusHighlightForeground': accent,
    'tree.indentGuidesStroke': border,
    'input.background': bgTertiary,
    'input.border': border,
    'input.foreground': text,
    'inputOption.activeBorder': accent,
    'inputOption.activeBackground': withAlpha(accent, 0.2),
    'dropdown.background': bgSecondary,
    'dropdown.border': border,
    'dropdown.foreground': text,
    'button.background': accent,
    'button.foreground': '#ffffff',
    'button.hoverBackground': t.colors.accentHover,
    'badge.background': accent,
    'badge.foreground': '#ffffff',
    'focusBorder': accent,
    'selection.background': withAlpha(accent, 0.35),
    'widget.shadow': 'rgba(0,0,0,0.4)',
    'menu.background': bgSecondary,
    'menu.foreground': text,
    'menu.selectionBackground': bgTertiary,
    'menu.separatorBackground': border,
    'peekView.border': accent,
    'peekViewEditor.background': bgSecondary,
    'peekViewResult.background': bg,
    'peekViewResult.fileForeground': text,
    'peekViewResult.lineForeground': textMuted,
    'peekViewResult.selectionBackground': bgTertiary,
    'peekViewTitle.background': bgSecondary,
    'peekViewTitleDescription.foreground': textMuted,
    'quickInput.background': bgSecondary,
    'quickInputList.focusBackground': bgTertiary,
    'quickInputList.focusForeground': text,
    'quickInputTitle.background': bgSecondary,
    'pickerGroup.border': border,
    'pickerGroup.foreground': accent,
    'widget.border': border,
    'terminal.background': bg,
    'gitDecoration.addedResourceForeground': success,
    'gitDecoration.modifiedResourceForeground': warning,
    'gitDecoration.deletedResourceForeground': error,
    'gitDecoration.untrackedResourceForeground': success,
    'gitDecoration.ignoredResourceForeground': textMuted,
    'charts.foreground': accent,
    'charts.lines': border,
  };
}

/** The Monaco theme name registered for a DWO theme key. */
export function getMonacoThemeName(themeKey: string): string {
  return `${THEME_PREFIX}${themeKey}`;
}

/**
 * Register a Monaco theme for every DWO theme.
 *
 * Idempotent: safe to call on every theme change. Monaco keeps the last
 * registration for a name, so re-registering refreshes it in place.
 */
export function registerDwoThemes(monaco: MonacoNamespace): void {
  for (const [key, tokens] of Object.entries(themes)) {
    const name = getMonacoThemeName(key);
    // All current DWO themes are dark; keep `base: 'vs-dark'` for inherited
    // tokenization defaults, and let `colors`/`rules` override brand details.
    const data: editor.IStandaloneThemeData = {
      base: 'vs-dark',
      inherit: true,
      rules: buildRules(tokens),
      colors: buildColors(tokens),
    };
    monaco.editor.defineTheme(name, data);
  }
}

/**
 * Activate a DWO theme in Monaco.
 *
 * Unknown keys fall back to the `dark` theme so a stale persisted setting can
 * never leave the editor unthemed.
 */
export function applyMonacoTheme(monaco: MonacoNamespace, themeKey: string): void {
  registerDwoThemes(monaco);
  const name = themeKey in themes ? themeKey : ('dark' as ThemeKey);
  monaco.editor.setTheme(getMonacoThemeName(name));
}
