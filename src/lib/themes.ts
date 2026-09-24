// Theme definitions for DWO — each theme maps to CSS custom properties on :root
// so changes apply in real-time without page reload.

export interface ThemeTokens {
  colors: {
    bg: string;
    bgSecondary: string;
    bgTertiary: string;
    text: string;
    textMuted: string;
    accent: string;
    accentHover: string;
    border: string;
    success: string;
    warning: string;
    error: string;
  };
  fonts: {
    monospace: string;
    sans: string;
  };
  spacing: {
    xs: string;
    sm: string;
    md: string;
    lg: string;
    xl: string;
  };
  borderRadius: {
    sm: string;
    md: string;
    lg: string;
  };
}

export const themes: Record<string, ThemeTokens> = {
  dark: {
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
    spacing: { xs: '4px', sm: '8px', md: '16px', lg: '24px', xl: '32px' },
    borderRadius: { sm: '4px', md: '8px', lg: '12px' },
  },
  midnight: {
    colors: {
      bg: '#0d1b2a',
      bgSecondary: '#142438',
      bgTertiary: '#1b2d42',
      text: '#e0e6ed',
      textMuted: '#7aa2c0',
      accent: '#5ba4e6',
      accentHover: '#7ec0f5',
      border: '#1e3a54',
      success: '#4ade80',
      warning: '#fbbf24',
      error: '#f87171',
    },
    fonts: {
      monospace: '"JetBrains Mono", "Fira Code", "Consolas", monospace',
      sans: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    },
    spacing: { xs: '4px', sm: '8px', md: '16px', lg: '24px', xl: '32px' },
    borderRadius: { sm: '4px', md: '8px', lg: '12px' },
  },
  ocean: {
    colors: {
      bg: '#1a1b26',
      bgSecondary: '#202330',
      bgTertiary: '#262a38',
      text: '#c0caf5',
      textMuted: '#565f89',
      accent: '#7aa2f7',
      accentHover: '#8db0f8',
      border: '#2e3c5e',
      success: '#9ece6a',
      warning: '#e0af68',
      error: '#f7768e',
    },
    fonts: {
      monospace: '"JetBrains Mono", "Fira Code", "Consolas", monospace',
      sans: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    },
    spacing: { xs: '4px', sm: '8px', md: '16px', lg: '24px', xl: '32px' },
    borderRadius: { sm: '4px', md: '8px', lg: '12px' },
  },
  carbon: {
    colors: {
      bg: '#161616',
      bgSecondary: '#262626',
      bgTertiary: '#393939',
      text: '#f4f4f4',
      textMuted: '#a8a8a8',
      accent: '#0062ff',
      accentHover: '#3d8bfd',
      border: '#393939',
      success: '#0d773b',
      warning: '#f3b601',
      error: '#da2a18',
    },
    fonts: {
      monospace: '"JetBrains Mono", "Fira Code", "Consolas", monospace',
      sans: '"IBM Plex Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    },
    spacing: { xs: '4px', sm: '8px', md: '16px', lg: '24px', xl: '32px' },
    borderRadius: { sm: '0px', md: '2px', lg: '4px' },
  },
};

export type ThemeKey = keyof typeof themes;
export type Theme = ThemeTokens;

/** Set CSS custom properties on :root for instant global theme application */
export function applyTheme(key: ThemeKey): void {
  const t = themes[key];
  const root = document.documentElement;
  for (const [name, value] of Object.entries(t.colors)) {
    root.style.setProperty(`--dwo-color-${name}`, value);
  }
  root.style.setProperty('--dwo-font-mono', t.fonts.monospace);
  root.style.setProperty('--dwo-font-sans', t.fonts.sans);
  for (const [name, value] of Object.entries(t.spacing)) {
    root.style.setProperty(`--dwo-space-${name}`, value);
  }
  for (const [name, value] of Object.entries(t.borderRadius)) {
    root.style.setProperty(`--dwo-radius-${name}`, value);
  }
  root.setAttribute('data-theme', key);
}

/** Read the currently saved theme key from localStorage, falling back to 'dark' */
export function loadThemeKey(): ThemeKey {
  try {
    const saved = localStorage.getItem('dwo-theme');
    if (saved && saved in themes) return saved as ThemeKey;
  } catch {}
  return 'dark';
}
