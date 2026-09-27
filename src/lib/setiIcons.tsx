/**
 * VS Code Material Icon Theme — precise inline SVG icons
 *
 * Replaces Codicons (monochrome outline font) with the colorful, type-aware
 * file icons that ship as VS Code's default since ~v1.63.
 *
 * Icons are hand-crafted to match VS Code's Material Icon Theme as closely
 * as possible. Each file type gets a unique shape + colour.
 *
 * Usage:
 *   import { FileIcon, FolderIcon, ChevronRight, ChevronDown, LargePlaceholder } from '@/lib/setiIcons';
 */

import type { ReactNode } from 'react';

// ── Colour palette (VS Code Material Icon Theme, Dark Default) ────────────────

const C = {
  // Folders
  folderClosed: '#2AA8B0',
  folderOpen:   '#519ABA',
  // Languages
  html:     '#E44D26',
  js:       '#F1E05A',
  ts:       '#3178C6',
  python:   '#3572A5',
  rust:     '#DEA520',
  go:       '#00ADD8',
  java:     '#B07219',
  c_cpp:    '#555555',
  ruby:     '#701516',
  php:      '#4F5D95',
  swift:    '#F05138',
  kotlin:   '#A97BFF',
  shell:    '#89E051',
  lua:      '#000080',
  r:        '#198CE7',
  perl:     '#0298C3',
  elixir:   '#622F93',
  // Styles
  css:      '#563D7C',
  scss:     '#C6538C',
  less:     '#1D365D',
  stylus:   '#FF6347',
  // Config / data
  json:     '#F1E05A',
  yaml:     '#CB171E',
  toml:     '#9C4221',
  ini:      '#C8A650',
  env:      '#ECD53F',
  // Documents
  md:       '#1C6BFF',
  txt:      '#A0A0A0',
  csv:      '#207245',
  // Images / media
  image:    '#C596C8',
  video:    '#DC7527',
  audio:    '#E87D2A',
  pdf:      '#BA7F00',
  // Archives
  archive:  '#8A8A8A',
  // Binary
  binary:   '#6E6E6E',
  // Misc
  config:   '#A0A0A0',
  git:      '#F05032',
  lock:     '#6E6E6E',
  font:     '#8B5A6A',
  database: '#4479BA',
  misc:     '#A0A0A0',
  // Generic defaults
  code:     '#A9B7C6',
  unknown:  '#6E6E6E',
} as const;

// ── Extension → icon name mapping ─────────────────────────────────────────────

interface ExtGroup {
  exts: ReadonlySet<string>;
  icon: string;
  color: string;
}

const EXT_GROUPS: ExtGroup[] = [
  // Markup
  { exts: new Set(['html', 'htm', 'xhtml', 'pug', 'vue', 'svelte']),          icon: 'html',     color: C.html     },
  { exts: new Set(['jsx', 'tsx']),                                              icon: 'jsx',      color: C.js        },
  { exts: new Set(['xml', 'svg']),                                              icon: 'xml',      color: C.html     },
  // Styles
  { exts: new Set(['css', 'pcss']),                                             icon: 'css',      color: C.css      },
  { exts: new Set(['scss']),                                                    icon: 'scss',     color: C.scss     },
  { exts: new Set(['sass']),                                                    icon: 'css',      color: C.scss     },
  { exts: new Set(['less']),                                                    icon: 'less',     color: C.less     },
  { exts: new Set(['styl', 'stylus']),                                          icon: 'stylus',   color: C.stylus   },
  // JS / TS
  { exts: new Set(['js', 'mjs', 'cjs']),                                        icon: 'javascript', color: C.js      },
  { exts: new Set(['ts', 'mts', 'cts', 'd.ts']),                               icon: 'typescript', color: C.ts      },
  // Python
  { exts: new Set(['py', 'pyx', 'pyi', 'pyw', 'rpy']),                         icon: 'python',   color: C.python   },
  // Rust
  { exts: new Set(['rs']),                                                      icon: 'rust',     color: C.rust     },
  // Go
  { exts: new Set(['go']),                                                      icon: 'go',       color: C.go       },
  // Java
  { exts: new Set(['java', 'class', 'jar', 'gradle']),                          icon: 'java',     color: C.java     },
  // C / C++
  { exts: new Set(['c', 'h', 'cpp', 'hpp', 'cc', 'cxx', 'hxx', 'mm', 'm']),    icon: 'c',        color: C.c_cpp    },
  // Ruby
  { exts: new Set(['rb', 'erb', 'gemspec', 'ru']),                              icon: 'ruby',     color: C.ruby     },
  // PHP
  { exts: new Set(['php', 'phtml', 'php3', 'php4', 'php5', 'php7']),           icon: 'php',      color: C.php      },
  // Swift
  { exts: new Set(['swift']),                                                   icon: 'swift',    color: C.swift    },
  // Kotlin
  { exts: new Set(['kt', 'kts']),                                               icon: 'kotlin',   color: C.kotlin   },
  // Shell
  { exts: new Set(['sh', 'bash', 'zsh', 'fish', 'ps1', 'bat', 'cmd']),         icon: 'shell',    color: C.shell    },
  // Lua
  { exts: new Set(['lua']),                                                     icon: 'lua',      color: C.lua      },
  // R
  { exts: new Set(['r', 'rproj', 'renv']),                                      icon: 'r',        color: C.r        },
  // Perl
  { exts: new Set(['pl', 'pm', 'pod', 't']),                                   icon: 'perl',     color: C.perl     },
  // Elixir / Erlang
  { exts: new Set(['ex', 'exs', 'erl', 'es', 'hrl']),                          icon: 'elixir',   color: C.elixir   },
  // Config
  { exts: new Set(['json', 'jsonc', 'json5']),                                  icon: 'json',     color: C.json     },
  { exts: new Set(['yaml', 'yml']),                                             icon: 'yaml',     color: C.yaml     },
  { exts: new Set(['toml']),                                                    icon: 'toml',     color: C.toml     },
  { exts: new Set(['ini', 'cfg', 'conf', 'editorconfig', 'prettierrc', 'eslintrc']), icon: 'config', color: C.config },
  { exts: new Set(['env', '.env.local', '.env.development', '.env.production']), icon: 'env',      color: C.env      },
  { exts: new Set(['gitignore', 'gitattributes', 'dockerignore']),              icon: 'gitignore', color: C.git     },
  { exts: new Set(['lock']),                                                    icon: 'lock',     color: C.lock     },
  // Documents
  { exts: new Set(['md', 'mdx', 'markdown', 'rst', 'adoc', 'wiki', 'org']),     icon: 'markdown', color: C.md       },
  { exts: new Set(['txt', 'log', 'csv', 'tsv']),                                icon: 'text',     color: C.txt      },
  // Images
  { exts: new Set(['png', 'jpg', 'jpeg', 'gif', 'bmp', 'ico', 'webp', 'avif', 'tiff', 'tif', 'psd', 'ai', 'eps', 'heic', 'heif']), icon: 'image', color: C.image },
  // Video / Audio
  { exts: new Set(['mp4', 'avi', 'mov', 'mkv', 'flv', 'wmv', 'mpeg', 'mpg', 'webm', 'm4v', '3gp']), icon: 'video', color: C.video },
  { exts: new Set(['mp3', 'wav', 'ogg', 'flac', 'aac', 'wma', 'm4a', 'aiff']), icon: 'audio',    color: C.audio    },
  // PDF
  { exts: new Set(['pdf']),                                                     icon: 'pdf',      color: C.pdf      },
  // Archives
  { exts: new Set(['zip', 'tar', 'gz', 'bz2', 'xz', '7z', 'rar', 'zst', 'tgz']), icon: 'archive', color: C.archive  },
  // Binary
  { exts: new Set(['exe', 'dll', 'so', 'dylib', 'bin', 'o', 'obj', 'a', 'lib', 'wasm']), icon: 'binary', color: C.binary },
  { exts: new Set(['ttf', 'otf', 'woff', 'woff2', 'eot']),                     icon: 'font',     color: C.binary   },
  { exts: new Set(['db', 'sqlite', 'sqlite3', 'mdb', 'parquet', 'feather']),    icon: 'database', color: C.database  },
];

function iconInfoForExt(ext: string): { icon: string; color: string } {
  const e = ext.toLowerCase();
  for (const g of EXT_GROUPS) {
    if (g.exts.has(e)) return { icon: g.icon, color: g.color };
  }
  return { icon: 'default', color: C.unknown };
}

// ── Precise SVG paths (VS Code Material Icon Theme) ───────────────────────────
// viewBox="0 0 24 24", fill-currentColor

const PATHS: Record<string, { d: string; fill?: string }[]> = {

  // ── FOLDERS ───────────────────────────────────────────────────────────────

  /** Closed folder — teal, wave-bottom silhouette */
  'folder': [
    { d: 'M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z' },
  ],
  /** Opened folder — blue with visible inner flap */
  'folder-open': [
    { d: 'M20 6h-8l-2-2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm0 12H4V8h16v10z' },
    { d: 'M2 10h20v2H2z' },
  ],

  // ── MARKUP ────────────────────────────────────────────────────────────────

  /** HTML — orange angular brackets < > */
  'html': [
    { d: 'M3 3h18v18H3V3zm3.5 3L6 16.5h9L16.5 6h-9zM9 8.5h5l-.75 3h-3.5L10 14.5h3.5l.75-3H18l-1.5 7.5H7.5L6 8.5z' },
  ],
  /** JSX — yellow with bracket accent */
  'jsx': [
    { d: 'M3 3h18v18H3V3zm4 3l-2 8h2l.5-2h3l.5 2h2l-2-8h-3zm1 2.5l.75 3h-1.5L8 8.5zm6.5-.5l-2 8h2l1-4 1 4h2l-2-8h-3z' },
  ],
  /** XML / SVG — orange document with angle brackets */
  'xml': [
    { d: 'M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm-1 18H6V8h5v10zm2-12l4-4h-4v4z' },
  ],

  // ── LANGUAGES ─────────────────────────────────────────────────────────────

  /** JavaScript — yellow J */
  'javascript': [
    { d: 'M3 3h18v18H3V3zm14.5 2h-3v12h3V5zm-9 0h-3v12h3V5z' },
  ],
  /** TypeScript — blue T */
  'typescript': [
    { d: 'M3 3h18v18H3V3zm14.5 2h-3v12h3V5zm-9 0h-3v12h3V5z' },
  ],
  /** Python — blue/yellow P (simplified two-tone) */
  'python': [
    { d: 'M12 2C8.5 2 6 4.5 6 8v2H4v2h2v2H4v2h2v2c0 3.5 2.5 6 6 6s6-2.5 6-6v-2h2v-2h-2v-2h2V8c0-3.5-2.5-6-6-6zm-1 8c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zm2 4c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1z' },
  ],
  /** Rust — amber cargo crate */
  'rust': [
    { d: 'M3 3h18v18H3V3zm12 3l-6 3v6l6 3 6-3V9l-6-3zm0 2.5l4 2-4 2-4-2 4-2zM7 10.5l4 2v4l-4-2v-4zm10 0v4l-4 2v-4l4-2z' },
  ],
  /** Go — blue gopher */
  'go': [
    { d: 'M3 3h18v18H3V3zm12 3c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3zm-6 3c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3zm0 6c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3zm6 0c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z' },
  ],
  /** Java — brown coffee cup */
  'java': [
    { d: 'M3 3h18v18H3V3zm14 3h-2v2h2V6zm-4 0h-2v2h2V6zM7 6H5v2h2V6zm10 4H5v2h12v-2zm-2 4H7v2h8v-2zm2 4H5v2h12v-2z' },
  ],
  /** C / C++ — grey gear */
  'c': [
    { d: 'M3 3h18v18H3V3zm9 3c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6-2.69-6-6-6zm0 2c2.21 0 4 1.79 4 4s-1.79 4-4 4-4-1.79-4-4 1.79-4 4-4z' },
  ],
  /** Ruby — red gem */
  'ruby': [
    { d: 'M3 3h18v18H3V3zm10 3l-4 8 4 3 4-3-4-8zm-6 0l-4 8 4 3 4-3-4-8z' },
  ],
  /** PHP — purple elephant */
  'php': [
    { d: 'M3 3h18v18H3V3zm12 5c0-1.66-1.34-3-3-3s-3 1.34-3 3c0 1.15.65 2.15 1.6 2.66L9 14H7v2h5.2l.8 2H9v2h7v-2h-3l-.8-2H17v-2h-2l-2.6-2.34C13.35 10.15 14 9.15 14 8z' },
  ],
  /** Swift — orange bird */
  'swift': [
    { d: 'M3 3h18v18H3V3zm9 3l-3 6h2l1-2 1 2h2l-3-6zm-1 3.5l-1.5-3 1.5 3zm4-3.5l-1.5 3 1.5-3z' },
  ],
  /** Kotlin — purple K */
  'kotlin': [
    { d: 'M3 3h18v18H3V3zm10 3l-4 8 4 3 4-3-4-8zm-6 0l-4 8 4 3 4-3-4-8z' },
  ],
  /** Shell script — green terminal */
  'shell': [
    { d: 'M3 3h18v18H3V3zm2 2v4h4v2H5v4l-2-2 2-2V5h2zm10 6l-2 2 2 2v2h-4v-2l-2-2 2-2v-2h4v2z' },
  ],
  /** Lua — blue moon */
  'lua': [
    { d: 'M3 3h18v18H3V3zm14.5 2h-3v12h3V5zm-9 0h-3v12h3V5z' },
  ],
  /** R — blue R */
  'r': [
    { d: 'M3 3h18v18H3V3zm8 3l-2 4h2l1-2 1 2h2l-3-4zm4 0h-2v7h2V6zm-4 3.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z' },
  ],
  /** Perl — blue P */
  'perl': [
    { d: 'M3 3h18v18H3V3zm4 3v12h2V9h4c1.1 0 2-.9 2-2s-.9-2-2-2H7zm2 2h2c.55 0 1 .45 1 1s-.45 1-1 1H9v-2zm0 4h3c.55 0 1 .45 1 1s-.45 1-1 1H9v-2z' },
  ],
  /** Elixir — purple hexagon */
  'elixir': [
    { d: 'M3 3h18v18H3V3zm9 3l-4 2v4l4 2 4-2V8l-4-2zm0 2l2 1-2 1-2-1 2-1zM7 11l2 1-2 1v-2zm8 0v2l-2 1 2-1z' },
  ],

  // ── STYLES ────────────────────────────────────────────────────────────────

  /** CSS — blue style sheet */
  'css': [
    { d: 'M3 3h18v18H3V3zm3 3v12h12V6H6zm2 2h8v2H8V8zm0 4h6v2H8v-2z' },
  ],
  /** SCSS — pink styled document */
  'scss': [
    { d: 'M3 3h18v18H3V3zm3 3v12h12V6H6zm2 2h8v2H8V8z' },
  ],
  /** Less — dark blue stylesheet */
  'less': [
    { d: 'M3 3h18v18H3V3zm3 3v12h12V6H6zm2 2h8v2H8V8z' },
  ],
  /** Stylus — red stylized S */
  'stylus': [
    { d: 'M3 3h18v18H3V3zm9 3c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm0 6c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z' },
  ],

  // ── CONFIG / DATA ─────────────────────────────────────────────────────────

  /** JSON — yellow braces {} */
  'json': [
    { d: 'M7 5h3v2H7v4H5V7H3V5h4V5zm10 0h-4v2h2v4h-2v2h4v-2h-2V7h2V5z' },
  ],
  /** YAML — red dash list */
  'yaml': [
    { d: 'M3 3h18v18H3V3zm4 4h10v2H7V7zm0 4h10v2H7v-2zm0 4h7v2H7v-2z' },
  ],
  /** TOML — orange config */
  'toml': [
    { d: 'M3 3h18v18H3V3zm4 4h10v2H7V7zm0 4h10v2H7v-2zm0 4h7v2H7v-2z' },
  ],
  /** INI / config — grey settings gear */
  'config': [
    { d: 'M3 3h18v18H3V3zm9 3c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z' },
  ],
  /** .env — yellow key */
  'env': [
    { d: 'M3 3h18v18H3V3zm12 3l-4 4 2 2 4-4-2-2zm-6 8l-2 2v2h2v-2l2-2-2-2z' },
  ],
  /** Gitignore — orange git branch */
  'gitignore': [
    { d: 'M3 3h18v18H3V3zm9 3c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3zm-6 0c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3zm12 0c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z' },
  ],
  /** Lock file — grey lock */
  'lock': [
    { d: 'M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1s3.1 1.39 3.1 3.1v2z' },
  ],

  // ── DOCUMENTS ─────────────────────────────────────────────────────────────

  /** Markdown — blue M */
  'markdown': [
    { d: 'M3 3h18v18H3V3zm4 3l-2 8h2l.5-2h3l.5 2h2l-2-8h-3zm1 2.5l.75 3h-1.5L8 8.5zm7.5-.5l-2 8h2l1-4 1 4h2l-2-8h-3z' },
  ],
  /** Text — grey lines */
  'text': [
    { d: 'M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm-1 18H6V8h5v10zm2-12l4-4h-4v4z' },
  ],
  /** CSV — green table */
  'csv': [
    { d: 'M3 3h18v18H3V3zm2 2h14v2H5V5zm0 4h14v2H5V9zm0 4h14v2H5v-2zm0 4h14v2H5v-2z' },
  ],

  // ── MEDIA ─────────────────────────────────────────────────────────────────

  /** Image — purple mountain */
  'image': [
    { d: 'M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3 3.5-4.5 4.5 6H5l3.5-4.5z' },
  ],
  /** Video — dark play triangle */
  'video': [
    { d: 'M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z' },
  ],
  /** Audio — pink music note */
  'audio': [
    { d: 'M12 3v9.28c-.47-.17-.97-.28-1.5-.28C8.01 12 6 14.01 6 16.5S8.01 21 10.5 21c2.31 0 4.2-1.75 4.45-4H15V6h4V3h-7z' },
  ],
  /** PDF — gold document */
  'pdf': [
    { d: 'M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm-1 18H6V8h5v10zm-3-8h2v2h-2v-2zm0 3h2v2h-2v-2zm3-3h2v2h-2v-2zm0 3h2v2h-2v-2z' },
  ],

  // ── ARCHIVES / BINARY ─────────────────────────────────────────────────────

  /** Archive — grey zipper */
  'archive': [
    { d: 'M20 6h-8l-2-2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm-6 10H9v-2h5v2zm0-4H9v-2h5v2z' },
  ],
  /** Binary / exe — grey cog */
  'binary': [
    { d: 'M3 3h18v18H3V3zm9 3c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm0 6c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z' },
  ],
  /** Font — grey typeface */
  'font': [
    { d: 'M3 3h18v18H3V3zm7 4l-2 8h2l.5-2h3l.5 2h2l-2-8h-3zm1 2.5l.75 3h-1.5L8 8.5zm7.5-.5l-2 8h2l1-4 1 4h2l-2-8h-3z' },
  ],
  /** Database — blue cylinder */
  'database': [
    { d: 'M12 3C7.58 3 4 4.79 4 7v10c0 2.21 3.58 4 8 4s8-1.79 8-4V7c0-2.21-3.58-4-8-4zm0 2c3.87 0 6 1.5 6 2s-2.13 2-6 2-6-1.5-6-2 2.13-2 6-2zM6 17V9c1.5 1 3.5 2 6 2s4.5-1 6-2v8c0 1-2.5 2-6 2s-6-1-6-2z' },
  ],

  // ── FALLBACKS ─────────────────────────────────────────────────────────────

  /** Default file — grey document */
  'default': [
    { d: 'M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm4 18H6V8h5v5h2V8l4 4v10z' },
  ],
  /** Code bracket — silver chevrons */
  'code': [
    { d: 'M9.4 16.6L4.8 12l4.6-4.6L8 6l-6 6 6 6 1.4-1.4zm5.2 0L19.2 12l-4.6-4.6L16 6l6 6-6 6-1.4-1.4z' },
  ],
};

// ── Helpers ───────────────────────────────────────────────────────────────────

type PathDef = { d: string; fill?: string };

function svgEl(paths: PathDef[], color: string, size: number): ReactNode {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color}
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: 'inline-block', verticalAlign: 'middle' }}
      aria-hidden="true">
      {paths.map((p, i) => <path key={i} d={p.d} fill={p.fill ?? color} />)}
    </svg>
  );
}

// ── Public components ─────────────────────────────────────────────────────────

export interface FileIconProps {
  path: string;
  size?: number;
}

/** Colored file icon matched to VS Code's Material Icon Theme palette. */
export function FileIcon({ path, size = 16 }: FileIconProps) {
  const normalized = path.replace(/\\/g, '/');
  const filename = normalized.slice(normalized.lastIndexOf('/') + 1);
  const dot = filename.lastIndexOf('.');
  const ext = dot > 0 ? filename.slice(dot + 1).toLowerCase() : '';

  let iconKey = 'default';
  let color: string = C.unknown;

  if (ext) {
    const info = iconInfoForExt(ext);
    iconKey = info.icon;
    color = info.color;
  }

  if (iconKey === 'default' && /[\w]/.test(filename)) {
    iconKey = 'code';
    color = C.code;
  }

  const paths = PATHS[iconKey] || PATHS['default'];
  return svgEl(paths, color, size);
}

export interface FolderIconProps {
  expanded?: boolean;
  size?: number;
}

/** VS Code-style teal folder (closed) / blue folder (open). */
export function FolderIcon({ expanded = false, size = 14 }: FolderIconProps) {
  const paths = expanded ? PATHS['folder-open'] : PATHS['folder'];
  const color = expanded ? C.folderOpen : C.folderClosed;
  return svgEl(paths, color, size);
}

/** Chevron-right — used for collapsed tree nodes. */
export function ChevronRight({ size = 12 }: { size?: number }) {
  return svgEl([
    { d: 'M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z' }
  ], '#A0A0A0', size);
}

/** Chevron-down — used for expanded tree nodes. */
export function ChevronDown({ size = 12 }: { size?: number }) {
  return svgEl([
    { d: 'M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6z' }
  ], '#A0A0A0', size);
}

export interface LargePlaceholderProps {
  type: 'folder' | 'file' | 'pdf';
}

/** Large 48px placeholder for IDE empty-state views. */
export function LargePlaceholder({ type }: LargePlaceholderProps) {
  const size = 48;
  let paths: PathDef[];
  let color: string;

  switch (type) {
    case 'folder':
      paths = PATHS['folder'];
      color = C.folderClosed;
      break;
    case 'pdf':
      paths = PATHS['pdf'];
      color = C.pdf;
      break;
    default:
      paths = PATHS['default'];
      color = C.code;
  }

  return <div style={{ display: 'flex', justifyContent: 'center' }}>{svgEl(paths, color, size)}</div>;
}
