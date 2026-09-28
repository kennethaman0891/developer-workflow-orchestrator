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
  /** VS Code Seti UI – the reference theme for the IDE section */
  seti: {
    colors: {
      bg: '#1e1e1e',          // Seti editor background
      bgSecondary: '#252526', // Seti sidebar
      bgTertiary: '#2d2d2d',  // Seti active tab / selection
      text: '#f8f8f2',        // Seti body text
      textMuted: '#868a8f',   // Seti muted text
      accent: '#ff9600',      // Seti keyword / import / decorator orange
      accentHover: '#ffb44d', // Seti lighter orange hover
      border: '#3e4452',      // Seti panel border
      success: '#5ec4b0',     // Seti teal (functions, operators, UI accents)
      warning: '#d19a66',     // Seti warm accent (numbers, constants)
      error: '#f44747',       // Seti red
    },
    fonts: {
      monospace: '"JetBrains Mono", "Fira Code", "Consolas", monospace',
      sans: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    },
    spacing: { xs: '4px', sm: '8px', md: '16px', lg: '24px', xl: '32px' },
    borderRadius: { sm: '4px', md: '8px', lg: '12px' },
  },
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
