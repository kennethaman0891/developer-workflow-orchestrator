'use client';

import { useState, useEffect } from 'react';
import { useTheme } from '@/contexts/ThemeContext';
import { useSettings } from '@/contexts/SettingsContext';
import { useTerminals } from '@/hooks/useTerminals';
import { getShellName } from '@/lib/shell';

// ── Icon components ──────────────────────────────────────────────────────────

function IconTheme() {
  const { theme } = useTheme();
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
      <circle cx="8" cy="8" r="3" stroke={theme.colors.accent} strokeWidth="1.5" />
      <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.5 3.5l1.4 1.4M11.1 11.1l1.4 1.4M3.5 12.5l1.4-1.4M11.1 4.9l1.4-1.4" stroke={theme.colors.textMuted} strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

function IconFont() {
  const { theme } = useTheme();
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
      <text x="2" y="12" fontSize="10" fontWeight="700" fill={theme.colors.accent} fontFamily="system-ui">A</text>
      <line x1="1" y1="14" x2="15" y2="14" stroke={theme.colors.textMuted} strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

function IconWrap() {
  const { theme } = useTheme();
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
      <path d="M2 4h9M2 8h6M2 12h4" stroke={theme.colors.textMuted} strokeWidth="1.3" strokeLinecap="round" />
      <path d="M11 5l2 3-2 3" stroke={theme.colors.accent} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconMap() {
  const { theme } = useTheme();
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
      <rect x="2" y="2" width="12" height="12" rx="2" stroke={theme.colors.textMuted} strokeWidth="1.2" />
      <line x1="5" y1="5" x2="11" y2="5" stroke={theme.colors.accent} strokeWidth="1.2" strokeLinecap="round" opacity="0.6" />
      <line x1="5" y1="8" x2="9" y2="8" stroke={theme.colors.accent} strokeWidth="1.2" strokeLinecap="round" opacity="0.4" />
      <line x1="5" y1="11" x2="10" y2="11" stroke={theme.colors.accent} strokeWidth="1.2" strokeLinecap="round" opacity="0.3" />
    </svg>
  );
}

function IconTerminal() {
  const { theme } = useTheme();
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
      <rect x="1" y="3" width="14" height="10" rx="2" stroke={theme.colors.textMuted} strokeWidth="1.2" />
      <path d="M4 7l2 2-2 2" stroke={theme.colors.accent} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      <line x1="8" y1="11" x2="11" y2="11" stroke={theme.colors.accent} strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

function IconTransparency() {
  const { theme } = useTheme();
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
      <rect x="2" y="2" width="12" height="12" rx="2" stroke={theme.colors.textMuted} strokeWidth="1.2" strokeDasharray="3 2" />
      <circle cx="8" cy="8" r="2" fill={theme.colors.accent} opacity="0.5" />
    </svg>
  );
}

// ── Theme preview cards ──────────────────────────────────────────────────────

const THEMES = [
  { id: 'seti', label: 'Seti', description: 'VS Code Seti', bg: '#1e1e1e', accent: '#ff9600', text: '#f8f8f2' },
  { id: 'dark', label: 'Dark', description: 'Classic dark', bg: '#0a0a0a', accent: '#4a9eff', text: '#e8e8e8' },
  { id: 'midnight', label: 'Midnight', description: 'Deep blue', bg: '#0d1b2a', accent: '#5ba4e6', text: '#e0e6ed' },
  { id: 'ocean', label: 'Ocean', description: 'Dracula-inspired', bg: '#1a1b26', accent: '#7aa2f7', text: '#c0caf5' },
  { id: 'carbon', label: 'Carbon', description: 'IBM Carbon', bg: '#161616', accent: '#4589ff', text: '#f4f4f4' },
];

function ThemeCard({
  id, label, description, bg, accent, text, active, onClick,
}: {
  id: string; label: string; description: string;
  bg: string; accent: string; text: string;
  active: boolean; onClick: () => void;
}) {
  const { theme } = useTheme();
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      style={{
        position: 'relative',
        background: 'transparent',
        border: `2px solid ${active ? accent : theme.colors.border}`,
        borderRadius: '10px',
        cursor: 'pointer',
        textAlign: 'left',
        transition: 'border-color 0.2s, box-shadow 0.2s',
        boxShadow: active ? `0 0 0 3px ${accent}30` : 'none',
        overflow: 'hidden',
        padding: 0,
      }}
      onMouseEnter={e => { if (!active) e.currentTarget.style.borderColor = theme.colors.textMuted; }}
      onMouseLeave={e => { if (!active) e.currentTarget.style.borderColor = theme.colors.border; }}
    >
      {/* Accent strip */}
      <div style={{ height: '4px', background: accent }} />
      {/* Preview area */}
      <div style={{ padding: '12px 14px', background: bg }}>
        <div style={{ fontSize: '13px', fontWeight: 600, color: text, marginBottom: '2px' }}>{label}</div>
        <div style={{ fontSize: '11px', color: text, opacity: 0.5 }}>{description}</div>
      </div>
      {active && (
        <div style={{
          position: 'absolute', top: '8px', right: '8px',
          width: '18px', height: '18px', borderRadius: '50%',
          background: accent, display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
            <path d="M2 6l3 3 5-5" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      )}
    </button>
  );
}

// ── Range slider ─────────────────────────────────────────────────────────────

function Slider({
  value, min, max, onChange, displayValue,
}: {
  value: number; min: number; max: number;
  onChange: (v: number) => void; displayValue: string;
}) {
  const { theme } = useTheme();
  const pct = ((value - min) / (max - min)) * 100;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
      <div style={{
        flex: 1, height: '6px', background: theme.colors.bgTertiary,
        borderRadius: '3px', position: 'relative', cursor: 'pointer', overflow: 'hidden',
      }}>
        <div style={{
          position: 'absolute', left: 0, top: 0, bottom: 0, width: `${pct}%`,
          background: `linear-gradient(90deg, ${theme.colors.accent}88, ${theme.colors.accent})`,
          borderRadius: '3px', transition: 'width 0.15s ease',
        }} />
        <input
          type="range" min={min} max={max} value={value}
          onChange={e => onChange(Number(e.target.value))}
          style={{
            position: 'absolute', inset: 0, width: '100%', height: '100%',
            opacity: 0, cursor: 'pointer', margin: 0, padding: 0,
          }}
        />
      </div>
      <span style={{
        fontSize: '12px', color: theme.colors.textMuted, minWidth: '42px',
        textAlign: 'right', fontVariantNumeric: 'tabular-nums', flexShrink: 0,
      }}>{displayValue}</span>
    </div>
  );
}

// ── Toggle switch ────────────────────────────────────────────────────────────

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  const { theme } = useTheme();
  return (
    <button
      role="switch" aria-checked={checked}
      onClick={() => onChange(!checked)}
      style={{
        width: '40px', height: '22px', flexShrink: 0,
        background: checked ? theme.colors.accent : theme.colors.bgTertiary,
        border: `1px solid ${checked ? theme.colors.accent : theme.colors.border}`,
        borderRadius: '11px', cursor: 'pointer', position: 'relative',
        transition: 'background 0.2s, border-color 0.2s, box-shadow 0.2s',
        boxShadow: checked ? `0 0 0 2px ${theme.colors.accent}33` : 'none',
        padding: 0,
      }}
    >
      <div style={{
        width: '14px', height: '14px', background: '#fff', borderRadius: '50%',
        position: 'absolute', top: '50%',
        left: checked ? 'calc(100% - 17px)' : '3px',
        transform: 'translateY(-50%)',
        transition: 'left 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
        boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
      }} />
    </button>
  );
}

// ── Settings row ─────────────────────────────────────────────────────────────

function SettingRow({
  icon, label, description, value, children,
}: {
  icon: React.ReactNode; label: string; description?: string; value?: string; children?: React.ReactNode;
}) {
  const { theme } = useTheme();
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '14px',
      padding: '14px 20px', borderBottom: `1px solid ${theme.colors.border}`,
    }}>
      <div style={{
        width: '34px', height: '34px', borderRadius: '8px',
        background: theme.colors.bgTertiary,
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        {icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '13px', fontWeight: 500, color: theme.colors.text }}>{label}</span>
          {value != null && (
            <span style={{
              fontSize: '11px', color: theme.colors.textMuted,
              background: theme.colors.bg, border: `1px solid ${theme.colors.border}`,
              padding: '1px 7px', borderRadius: '4px',
              fontVariantNumeric: 'tabular-nums',
            }}>{value}</span>
          )}
        </div>
        {description && (
          <div style={{ fontSize: '11px', color: theme.colors.textMuted, marginTop: '3px' }}>
            {description}
          </div>
        )}
      </div>
      {children && <div style={{ flexShrink: 0 }}>{children}</div>}
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────────────────

export function SettingsPanel() {
  const { theme, setTheme, currentThemeKey } = useTheme();
  const { defaultShell, setShell } = useTerminals();
  const {
    fontSize, wordWrap, minimap, transparency,
    setFontSize, setWordWrap, setMinimap, setTransparency,
  } = useSettings();

  const [selectedShell, setSelectedShell] = useState(() => getShellName(defaultShell));

  useEffect(() => {
    setSelectedShell(getShellName(defaultShell));
  }, [defaultShell]);

  const shells = [
    { value: '/bin/bash', label: 'Bash' },
    { value: '/bin/zsh', label: 'Zsh' },
    { value: '/usr/bin/fish', label: 'Fish' },
    { value: '/usr/bin/pwsh', label: 'PowerShell' },
  ];

  const handleShellChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedShell(getShellName(e.target.value));
    setShell(e.target.value);
  };

  const selectStyle: React.CSSProperties = {
    background: theme.colors.bgTertiary,
    border: `1px solid ${theme.colors.border}`,
    color: theme.colors.text,
    padding: '6px 10px',
    borderRadius: '6px',
    fontSize: '12px',
    cursor: 'pointer',
    outline: 'none',
  };

  return (
    <div style={{
      height: '100%',
      overflowY: 'auto',
      overflowX: 'hidden',
      padding: '32px 32px 48px',
    }}>
      {/* Header */}
      <div style={{ marginBottom: '36px' }}>
        <h1 style={{
          fontSize: '22px', fontWeight: 700, color: theme.colors.text,
          margin: '0 0 6px', letterSpacing: '-0.02em',
        }}>
          Settings
        </h1>
        <p style={{ fontSize: '13px', color: theme.colors.textMuted, margin: 0 }}>
          Customize your DWO experience
        </p>
      </div>

      {/* ── Appearance ── */}
      <section style={{ marginBottom: '36px' }}>
        <h2 style={{
          fontSize: '11px', fontWeight: 600, color: theme.colors.textMuted,
          textTransform: 'uppercase', letterSpacing: '0.08em',
          margin: '0 0 14px',
        }}>
          Appearance
        </h2>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(148px, 1fr))',
          gap: '10px',
        }}>
          {THEMES.map(t => (
            <ThemeCard key={t.id} {...t} active={currentThemeKey === t.id} onClick={() => setTheme(t.id)} />
          ))}
        </div>
      </section>

      {/* ── Editor ── */}
      <section style={{ marginBottom: '36px' }}>
        <h2 style={{
          fontSize: '11px', fontWeight: 600, color: theme.colors.textMuted,
          textTransform: 'uppercase', letterSpacing: '0.08em',
          margin: '0 0 14px',
        }}>
          Editor
        </h2>
        <div style={{
          background: theme.colors.bgSecondary,
          border: `1px solid ${theme.colors.border}`,
          borderRadius: '12px',
          overflow: 'hidden',
        }}>
          <SettingRow
            icon={<IconFont />}
            label="Font Size"
            description="Adjust the editor text size"
            value={`${fontSize}px`}
          >
            <div style={{ width: '180px', flexShrink: 0 }}>
              <Slider value={fontSize} min={12} max={24} onChange={setFontSize} displayValue={`${fontSize}px`} />
            </div>
          </SettingRow>

          <SettingRow
            icon={<IconWrap />}
            label="Word Wrap"
            description="Wrap long lines to fit the viewport"
          >
            <Toggle checked={wordWrap} onChange={setWordWrap} />
          </SettingRow>

          <SettingRow
            icon={<IconMap />}
            label="Minimap"
            description="Show a mini code overview on the right"
          >
            <Toggle checked={minimap} onChange={setMinimap} />
          </SettingRow>
        </div>
      </section>

      {/* ── Terminal ── */}
      <section style={{ marginBottom: '36px' }}>
        <h2 style={{
          fontSize: '11px', fontWeight: 600, color: theme.colors.textMuted,
          textTransform: 'uppercase', letterSpacing: '0.08em',
          margin: '0 0 14px',
        }}>
          Terminal
        </h2>
        <div style={{
          background: theme.colors.bgSecondary,
          border: `1px solid ${theme.colors.border}`,
          borderRadius: '12px',
          overflow: 'hidden',
        }}>
          <SettingRow
            icon={<IconTerminal />}
            label="Default Shell"
            description="Shell used for new terminal sessions"
            value={selectedShell}
          >
            <select value={defaultShell} onChange={handleShellChange} style={selectStyle}>
              {shells.map(s => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </SettingRow>

          <SettingRow
            icon={<IconTransparency />}
            label="Transparency"
            description="Make terminal panels partially transparent"
            value={`${transparency}%`}
          >
            <div style={{ width: '180px', flexShrink: 0 }}>
              <Slider value={transparency} min={0} max={100} onChange={setTransparency} displayValue={`${transparency}%`} />
            </div>
          </SettingRow>
        </div>
      </section>
    </div>
  );
}
