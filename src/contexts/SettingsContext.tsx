'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export interface AppSettings {
  theme: string;
  fontSize: number;
  wordWrap: boolean;
  minimap: boolean;
  transparency: number; // 0 = opaque, 100 = fully transparent
  defaultShell: string;
  /** Allow workspaces to auto-launch CLI commands in terminal panes */
  autoExecEnabled: boolean;
}

const STORAGE_KEY = 'dwo-app-settings';

const DEFAULTS: AppSettings = {
  theme: 'dark',
  fontSize: 14,
  wordWrap: true,
  minimap: true,
  transparency: 0,
  defaultShell: '/bin/zsh',
  autoExecEnabled: true,
};

function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<AppSettings>;
      return { ...DEFAULTS, ...parsed };
    }
  } catch {}
  return { ...DEFAULTS };
}

function saveSettings(s: AppSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {}
}

interface SettingsValue extends AppSettings {
  setTheme: (key: string) => void;
  setFontSize: (size: number) => void;
  setWordWrap: (wrap: boolean) => void;
  setMinimap: (show: boolean) => void;
  setTransparency: (val: number) => void;
  setShell: (shell: string) => void;
  setAutoExecEnabled: (enabled: boolean) => void;
}

const SettingsContext = createContext<SettingsValue | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(loadSettings);

  // Persist whenever settings change
  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  const update = (partial: Partial<AppSettings>) => {
    setSettings(prev => ({ ...prev, ...partial }));
  };

  const setTheme = (key: string) => update({ theme: key });
  const setFontSize = (fontSize: number) => update({ fontSize });
  const setWordWrap = (wordWrap: boolean) => update({ wordWrap });
  const setMinimap = (show: boolean) => update({ minimap: show });
  const setTransparency = (transparency: number) => update({ transparency });
  const setShell = (defaultShell: string) => update({ defaultShell });
  const setAutoExecEnabled = (enabled: boolean) => update({ autoExecEnabled: enabled });

  return (
    <SettingsContext.Provider value={{ ...settings, setTheme, setFontSize, setWordWrap, setMinimap, setTransparency, setShell, setAutoExecEnabled }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings(): SettingsValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used within SettingsProvider');
  return ctx;
}
