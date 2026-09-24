'use client';

import { useState, useEffect } from 'react';
import { useTheme } from '@/contexts/ThemeContext';
import { useSettings } from '@/contexts/SettingsContext';
import { useTerminals } from '@/hooks/useTerminals';
import { getShellName } from '@/lib/shell';

export function SettingsPanel() {
  const { theme, setTheme, currentThemeKey } = useTheme();
  const { defaultShell, setShell } = useTerminals();
  const {
    fontSize,
    wordWrap,
    minimap,
    transparency,
    setFontSize,
    setWordWrap,
    setMinimap,
    setTransparency,
  } = useSettings();

  const [selectedShell, setSelectedShell] = useState(() => getShellName(defaultShell));

  // Keep selectedShell in sync when defaultShell changes externally
  useEffect(() => {
    setSelectedShell(getShellName(defaultShell));
  }, [defaultShell]);

  const shells = [
    { value: '/bin/bash', label: 'Bash' },
    { value: '/bin/zsh', label: 'Zsh' },
    { value: '/usr/bin/fish', label: 'Fish' },
    { value: '/usr/bin pwsh', label: 'PowerShell' },
  ];

  const handleShellChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newShell = e.target.value;
    setSelectedShell(getShellName(newShell));
    setShell(newShell);
  };

  const themes = [
    { id: 'dark', label: 'Dark', preview: '#0a0a0a' },
    { id: 'midnight', label: 'Midnight', preview: '#0d1b2a' },
    { id: 'ocean', label: 'Ocean', preview: '#1a1b26' },
    { id: 'carbon', label: 'Carbon', preview: '#161616' },
  ];

  return (
    <div style={{ padding: '24px', overflow: 'auto' }}>
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '20px', fontWeight: 600, color: theme.colors.text, margin: '0 0 8px 0' }}>
          Settings
        </h1>
        <p style={{ fontSize: '13px', color: theme.colors.textMuted, margin: 0 }}>
          Customize your DWO experience
        </p>
      </div>

      {/* Appearance */}
      <section style={{ marginBottom: '24px' }}>
        <h2 style={{ fontSize: '13px', fontWeight: 600, color: theme.colors.text, marginBottom: '12px' }}>
          Appearance
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: '8px' }}>
          {themes.map(t => (
            <button
              key={t.id}
              onClick={() => setTheme(t.id)}
              style={{
                padding: '12px',
                background: t.preview,
                border: `2px solid ${currentThemeKey === t.id ? theme.colors.accent : theme.colors.border}`,
                borderRadius: '6px',
                cursor: 'pointer',
                textAlign: 'center',
                transition: 'border-color 0.15s',
              }}
            >
              <div style={{ width: '32px', height: '32px', background: t.preview, border: '1px solid rgba(255,255,255,0.1)', borderRadius: '4px', margin: '0 auto 8px' }} />
              <div style={{ fontSize: '11px', color: theme.colors.text }}>{t.label}</div>
            </button>
          ))}
        </div>
      </section>

      {/* Editor */}
      <section style={{ marginBottom: '24px' }}>
        <h2 style={{ fontSize: '13px', fontWeight: 600, color: theme.colors.text, marginBottom: '12px' }}>
          Editor
        </h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <SettingRow label="Font Size" value={`${fontSize}px`}>
            <input
              type="range"
              min="12"
              max="24"
              value={fontSize}
              onChange={e => setFontSize(Number(e.target.value))}
              style={{ width: '120px' }}
            />
          </SettingRow>
          <SettingRow label="Word Wrap">
            <Toggle checked={wordWrap} onChange={setWordWrap} />
          </SettingRow>
          <SettingRow label="Minimap">
            <Toggle checked={minimap} onChange={setMinimap} />
          </SettingRow>
        </div>
      </section>

      {/* Terminal */}
      <section style={{ marginBottom: '24px' }}>
        <h2 style={{ fontSize: '13px', fontWeight: 600, color: theme.colors.text, marginBottom: '12px' }}>
          Terminal
        </h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <SettingRow label="Default Shell" value={selectedShell}>
            <select
              style={styles.select(theme)}
              value={defaultShell}
              onChange={handleShellChange}
            >
              {shells.map(s => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </SettingRow>
          <SettingRow label="Transparency" value={`${transparency}%`}>
            <input
              type="range"
              min="0"
              max="100"
              value={transparency}
              onChange={e => setTransparency(Number(e.target.value))}
              style={{ width: '120px' }}
            />
          </SettingRow>
        </div>
      </section>
    </div>
  );
}

function SettingRow({ label, value, children }: { label: string; value?: string; children?: React.ReactNode }) {
  const { theme } = useTheme();
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <div>
        <div style={{ fontSize: '12px', color: theme.colors.text }}>{label}</div>
        {value && <div style={{ fontSize: '11px', color: theme.colors.textMuted }}>{value}</div>}
      </div>
      {children}
    </div>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  const { theme } = useTheme();
  return (
    <button
      onClick={() => onChange(!checked)}
      style={{
        width: '40px',
        height: '20px',
        background: checked ? theme.colors.accent : theme.colors.bgTertiary,
        border: 'none',
        borderRadius: '10px',
        cursor: 'pointer',
        position: 'relative',
        transition: 'background 0.2s',
      }}
    >
      <div style={{
        width: '16px',
        height: '16px',
        background: '#fff',
        borderRadius: '50%',
        position: 'absolute',
        top: '2px',
        left: checked ? '22px' : '2px',
        transition: 'left 0.2s',
      }} />
    </button>
  );
}

const styles = {
  select: (t: any) => ({
    background: t.colors.bg,
    border: `1px solid ${t.colors.border}`,
    color: t.colors.text,
    padding: '4px 8px',
    borderRadius: '4px',
    fontSize: '12px',
  }),
};
