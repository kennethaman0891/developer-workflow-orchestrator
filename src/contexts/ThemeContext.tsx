'use client';

import { createContext, useContext, useState, ReactNode } from 'react';

// Design tokens
export const theme = {
  colors: {
    bg: '#0a0a0a',
    bgSecondary: '#111111',
    bgTertiary: '#1a1a1a',
    text: '#e8e8e8',
    textMuted: '#888888',
    accent: '#4a9eff',
    accentHover: '#6ab0ff',
    border: '#2a2a2a',
    success: '#4ade80',
    warning: '#fbbf24',
    error: '#f87171',
  },
  fonts: {
    monospace: '"JetBrains Mono", "Fira Code", "Consolas", monospace',
    sans: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  spacing: {
    xs: '4px',
    sm: '8px',
    md: '16px',
    lg: '24px',
    xl: '32px',
  },
  borderRadius: {
    sm: '4px',
    md: '8px',
    lg: '12px',
  },
};

export type Theme = typeof theme;

interface ThemeContextType {
  theme: Theme;
}

const ThemeContext = createContext<ThemeContextType | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [themeState] = useState<Theme>(theme);
  return (
    <ThemeContext.Provider value={{ theme: themeState }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return context;
}
