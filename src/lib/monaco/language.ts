/**
 * Language detection for the Monaco editor.
 *
 * Monaco registers every language it supports together with its file extensions
 * and exact filenames (`languages.getLanguages()`), so rather than maintaining a
 * second hand-written list that silently rots, we build our lookup from Monaco's
 * own catalogue at load time.
 *
 * Coverage here includes everything the old CodeMirror setup advertised but could
 * not deliver — PHP, Rust, Go, Java, Ruby, YAML, SQL, Shell, Markdown and ~70 more.
 */

import type { languages } from 'monaco-editor';

export interface LanguageCatalogue {
  /** `languageId` keyed by extension, including the leading dot (`.ts`). */
  byExtension: ReadonlyMap<string, string>;
  /** `languageId` keyed by exact filename, lower-cased (`dockerfile`, `.env`). */
  byFilename: ReadonlyMap<string, string>;
  /** Regex patterns compiled from `filenamePatterns` (e.g. `.*\\.ts`). */
  byFilenamePattern: ReadonlyArray<{ re: RegExp; languageId: string }>;
  /** First-line shebang patterns (e.g. `#!/usr/bin/env node`). */
  firstLines: ReadonlyArray<{ re: RegExp; languageId: string }>;
}

const cache = new WeakMap<object, LanguageCatalogue>();

/**
 * Compile Monaco's registered languages into a fast lookup structure.
 * Memoised per Monaco instance, so it runs once per app session.
 */
export function getLanguageCatalogue(monaco: {
  languages: typeof languages;
}): LanguageCatalogue {
  const cached = cache.get(monaco.languages);
  if (cached) return cached;

  const byExtension = new Map<string, string>();
  const byFilename = new Map<string, string>();
  const byFilenamePattern: Array<{ re: RegExp; languageId: string }> = [];
  const firstLines: Array<{ re: RegExp; languageId: string }> = [];

  for (const lang of monaco.languages.getLanguages()) {
    for (const ext of lang.extensions ?? []) {
      // First registration wins so a shared extension keeps its conventional owner.
      const key = ext.toLowerCase();
      if (!byExtension.has(key)) byExtension.set(key, lang.id);
    }
    for (const name of lang.filenames ?? []) {
      const key = name.toLowerCase();
      if (!byFilename.has(key)) byFilename.set(key, lang.id);
    }
    for (const pattern of lang.filenamePatterns ?? []) {
      try {
        byFilenamePattern.push({ re: new RegExp(`^(?:${pattern})$`, 'i'), languageId: lang.id });
      } catch {
        // A malformed upstream pattern must not break editor startup.
      }
    }
    if (lang.firstLine) {
      try {
        firstLines.push({ re: new RegExp(lang.firstLine, 'i'), languageId: lang.id });
      } catch {
        // Same as above.
      }
    }
  }

  const catalogue: LanguageCatalogue = {
    byExtension,
    byFilename,
    byFilenamePattern,
    firstLines,
  };
  cache.set(monaco.languages, catalogue);
  return catalogue;
}

/**
 * Determine the Monaco language id for a path.
 *
 * Order mirrors Monaco's own resolution: exact filename first (so `Makefile` and
 * `.gitignore` win over their lack of extension), then extension, then pattern.
 */
export function getLanguageForPath(
  monaco: { languages: typeof languages },
  path: string,
): string | undefined {
  const catalogue = getLanguageCatalogue(monaco);
  const normalized = path.replace(/\\/g, '/');
  const filename = normalized.slice(normalized.lastIndexOf('/') + 1);
  const lowerName = filename.toLowerCase();

  const exact = catalogue.byFilename.get(lowerName);
  if (exact) return exact;

  const dot = filename.lastIndexOf('.');
  if (dot > 0) {
    const ext = filename.slice(dot).toLowerCase();
    const byExt = catalogue.byExtension.get(ext);
    if (byExt) return byExt;
  }

  for (const { re, languageId } of catalogue.byFilenamePattern) {
    if (re.test(filename)) return languageId;
  }

  return undefined;
}

/**
 * Human-readable language label for the status bar, falling back to the raw id.
 */
export function getLanguageLabel(
  monaco: { languages: typeof languages },
  languageId: string | undefined,
): string {
  if (!languageId) return 'Plain Text';
  const match = monaco.languages.getLanguages().find((l) => l.id === languageId);
  const alias = match?.aliases?.[0];
  return alias ?? languageId;
}
