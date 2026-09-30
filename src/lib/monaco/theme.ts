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

/** Minimal named-colour table for tokens that use CSS keywords. */
const NAMED_COLORS: Record<string, string> = {
  black: '#000000',
  white: '#ffffff',
  red: '#ff0000',
  green: '#008000',
  blue: '#0000ff',
  grey: '#808080',
  gray: '#808080',
  transparent: '#000000',
};

function clampByte(n: number): string {
  return Math.round(Math.max(0, Math.min(255, n)))
    .toString(16)
    .padStart(2, '0');
}

/**
 * Normalise any CSS colour to `#rrggbb` (Monaco rejects `#rgb` and alpha in rules).
 * Handles `#rgb`, `#rrggbb`, `#rrggbbaa`, `rgb()/rgba()` and named colours.
 * Unrecognised input falls back to `fallback` (default neutral grey) rather
 * than throwing — a single bad token must never grey out the whole editor.
 */
function toHex6(value: string, fallback = '#c0c0c0'): string {
  const v = value.trim().toLowerCase();
  if (HEX_RE.test(v)) return v;
  if (/^#[0-9a-f]{3}$/i.test(v)) {
    const [, r, g, b] = v;
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  if (/^#[0-9a-f]{8}$/i.test(v)) {
    // Strip alpha — rules carry no alpha channel.
    return v.slice(0, 7);
  }
  const rgb = v.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*[\d.]+\s*)?\)$/);
  if (rgb) {
    return `#${clampByte(Number(rgb[1]))}${clampByte(Number(rgb[2]))}${clampByte(Number(rgb[3]))}`;
  }
  if (NAMED_COLORS[v]) return NAMED_COLORS[v];
  console.warn(`[monaco-theme] unrecognised colour "${value}", using ${fallback}`);
  return fallback;
}

/** Append an alpha channel (`#rrggbb` + 2 hex digits) for translucent editor colours. */
function withAlpha(hex: string, alpha: number): string {
  const a = Math.round(Math.max(0, Math.min(1, alpha)) * 255);
  return `${toHex6(hex)}${a.toString(16).padStart(2, '0')}`;
}

function buildRules(t: ThemeTokens): editor.ITokenThemeRule[] {
  const { text, textMuted, accent, accentHover, success, warning, error } = t.colors;
  const base = toHex6(text);
  const muted = toHex6(textMuted);
  const kw = toHex6(accent);
  const fn = toHex6(accentHover);
  const str = toHex6(success);
  const num = toHex6(warning);
  const err = toHex6(error);

  return [
    // Base default
    { token: '', foreground: base },
    { token: 'invalid', foreground: err },
    { token: 'emphasis', fontStyle: 'italic' },
    { token: 'strong', fontStyle: 'bold' },

    // Comments
    { token: 'comment', foreground: muted, fontStyle: 'italic' },
    { token: 'comment.html', foreground: muted, fontStyle: 'italic' },
    { token: 'comment.content', foreground: muted, fontStyle: 'italic' },
    { token: 'comment.content.html', foreground: muted, fontStyle: 'italic' },
    { token: 'comment.css', foreground: muted, fontStyle: 'italic' },
    { token: 'comment.js', foreground: muted, fontStyle: 'italic' },
    { token: 'comment.ts', foreground: muted, fontStyle: 'italic' },

    // Keywords & Operators
    { token: 'keyword', foreground: kw },
    { token: 'keyword.control', foreground: kw },
    { token: 'keyword.operator', foreground: muted },
    { token: 'keyword.other', foreground: kw },
    { token: 'keyword.js', foreground: kw },
    { token: 'keyword.ts', foreground: kw },
    { token: 'keyword.css', foreground: kw },
    { token: 'keyword.json', foreground: fn },
    { token: 'keyword.flow', foreground: kw },
    { token: 'keyword.flow.scss', foreground: kw },
    { token: 'operator', foreground: muted },
    { token: 'operator.scss', foreground: muted },
    { token: 'operator.sql', foreground: muted },
    { token: 'operator.swift', foreground: muted },
    { token: 'delimiter', foreground: muted },
    { token: 'delimiter.bracket', foreground: muted },
    { token: 'delimiter.parenthesis', foreground: muted },
    { token: 'delimiter.html', foreground: muted },
    { token: 'delimiter.xml', foreground: muted },
    { token: 'delimiter.css', foreground: muted },

    // Strings & Characters
    { token: 'string', foreground: str },
    { token: 'string.escape', foreground: fn },
    { token: 'string.regex', foreground: num },
    { token: 'string.html', foreground: str },
    { token: 'string.xml', foreground: str },
    { token: 'string.css', foreground: str },
    { token: 'string.scss', foreground: str },
    { token: 'string.yaml', foreground: str },
    { token: 'string.sql', foreground: str },
    { token: 'string.key.json', foreground: kw },
    { token: 'string.value.json', foreground: str },

    // Numbers & Constants
    { token: 'number', foreground: num },
    { token: 'number.hex', foreground: num },
    { token: 'number.octal', foreground: num },
    { token: 'number.binary', foreground: num },
    { token: 'number.float', foreground: num },
    { token: 'regexp', foreground: num },
    { token: 'constant', foreground: num },
    { token: 'constant.character', foreground: num },
    { token: 'constant.numeric', foreground: num },

    // Types, Namespaces & Classes
    { token: 'type', foreground: fn },
    { token: 'type.identifier', foreground: fn },
    { token: 'class', foreground: fn },
    { token: 'namespace', foreground: fn },
    { token: 'interface', foreground: fn },
    { token: 'struct', foreground: fn },

    // Functions & Identifiers
    { token: 'function', foreground: fn },
    { token: 'function.call', foreground: fn },
    { token: 'member', foreground: fn },
    { token: 'identifier', foreground: base },
    { token: 'variable', foreground: base },
    { token: 'variable.predefined', foreground: fn },
    { token: 'variable.parameter', foreground: fn },

    // HTML / XML
    { token: 'tag', foreground: kw },
    { token: 'tag.html', foreground: kw },
    { token: 'tag.xml', foreground: kw },
    { token: 'metatag', foreground: kw },
    { token: 'metatag.html', foreground: kw },
    { token: 'metatag.xml', foreground: kw },
    { token: 'metatag.content.html', foreground: fn },
    { token: 'metatag.content.xml', foreground: fn },
    { token: 'attribute.name', foreground: fn },
    { token: 'attribute.name.html', foreground: fn },
    { token: 'attribute.name.xml', foreground: fn },
    { token: 'attribute.value', foreground: str },
    { token: 'attribute.value.html', foreground: str },
    { token: 'attribute.value.xml', foreground: str },

    // CSS / SCSS / LESS
    { token: 'tag.css', foreground: kw },
    { token: 'tag.scss', foreground: kw },
    { token: 'tag.less', foreground: kw },
    { token: 'selector.css', foreground: kw },
    { token: 'attribute.name.css', foreground: fn },
    { token: 'attribute.name.scss', foreground: fn },
    { token: 'attribute.name.less', foreground: fn },
    { token: 'property.css', foreground: fn },
    { token: 'attribute.value.css', foreground: str },
    { token: 'attribute.value.number.css', foreground: num },
    { token: 'attribute.value.unit.css', foreground: num },
    { token: 'attribute.value.hex.css', foreground: num },
    { token: 'variable.css', foreground: fn },
    { token: 'variable.scss', foreground: fn },

    // Annotations & Decorators
    { token: 'annotation', foreground: num },
    { token: 'decorator', foreground: num },

    // Markdown
    { token: 'header', foreground: kw, fontStyle: 'bold' },
    { token: 'string.link', foreground: fn },
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
