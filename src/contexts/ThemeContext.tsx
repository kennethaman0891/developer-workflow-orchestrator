'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { themes, type ThemeKey, type ThemeTokens } from '@/lib/themes';

interface ThemeContextType {
  theme: ThemeTokens;
  setTheme: (key: ThemeKey) => void;
  currentThemeKey: ThemeKey;
}

const ThemeContext = createContext<ThemeContextType | null>(null);

/**
 * camelCase → kebab-case (`textMuted` → `text-muted`).
 *
 * Components read the kebab-case form (`var(--dwo-color-text-muted)`), while
 * the token keys are camelCase. Both variants are written to :root so either
 * spelling resolves — previously only camelCase was emitted and every
 * kebab-case usage silently fell back to its hardcoded default colour.
 */
function kebab(name: string): string {
  return name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Start from the shared default on BOTH server and client so the first
  // render matches the SSR'd HTML. The saved theme is hydrated after mount —
  // reading localStorage in the initializer desynced the trees (server had
  // no localStorage, so it fell back to 'seti' while the client used the
  // saved theme) and tripped React's hydration check.
  const [currentThemeKey, setCurrentThemeKey] = useState<ThemeKey>('seti');

  useEffect(() => {
    try {
      const saved = localStorage.getItem('dwo-theme');
      if (saved && saved in themes) setCurrentThemeKey(saved as ThemeKey);
    } catch {}
  }, []);

  const theme = themes[currentThemeKey];

  // Apply CSS custom properties to :root whenever theme changes
  useEffect(() => {
    const root = document.documentElement;
    for (const [name, value] of Object.entries(theme.colors)) {
      root.style.setProperty(`--dwo-color-${name}`, value);
      root.style.setProperty(`--dwo-color-${kebab(name)}`, value);
    }
    // `surface` is referenced by ErrorBoundary but is not a token on its own —
    // alias it to bgTertiary so the reference resolves.
    root.style.setProperty('--dwo-color-surface', 'var(--dwo-color-bg-tertiary)');
    root.style.setProperty('--dwo-font-mono', theme.fonts.monospace);
    root.style.setProperty('--dwo-font-sans', theme.fonts.sans);
    for (const [name, value] of Object.entries(theme.spacing)) {
      root.style.setProperty(`--dwo-space-${name}`, value);
    }
    for (const [name, value] of Object.entries(theme.borderRadius)) {
      root.style.setProperty(`--dwo-radius-${name}`, value);
    }
    root.setAttribute('data-theme', currentThemeKey);
  }, [theme, currentThemeKey]);

  const setTheme = (key: ThemeKey) => {
    setCurrentThemeKey(key);
    try {
      localStorage.setItem('dwo-theme', key);
    } catch {}
  };

  return (
    <ThemeContext.Provider value={{ theme, setTheme, currentThemeKey }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextType {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
