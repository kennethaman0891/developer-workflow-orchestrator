'use client';

import { useState, useEffect } from 'react';
import { useTheme } from '@/contexts/ThemeContext';
import { useSettings } from '@/contexts/SettingsContext';
import { useTerminals } from '@/hooks/useTerminals';
import { getShellName } from '@/lib/shell';

// ── Icon components (inline SVG to avoid extra deps) ────────────────────────

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

const themes = [
  { id: 'dark', label: 'Dark', description: 'Classic dark', colors: ['#0a0a0a', '#4a9eff', '#e8e8e8'] },
  { id: 'midnight', label: 'Midnight', description: 'Deep blue', colors: ['#0d1b2a', '#5ba4e6', '#e0e6ed'] },
  { id: 'ocean', label: 'Ocean', description: 'Dracula-inspired', colors: ['#1a1b26', '#7aa2f7', '#c0caf5'] },
  { id: 'carbon', label: 'Carbon', description: 'IBM Carbon', colors: ['#161616', '#0062ff', '#f4f4f4'] },
];

function ThemeCard({ id, label, description, colors, active, onClick }: {
  id: string;
  label: string;
  description: string;
  colors: string[];
  active: boolean;
  onClick: () => void;
}) {
  const { theme } = useTheme();
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      style={{
        position: 'relative',
        padding: '0',
        background: 'transparent',
        border: `2px solid ${active ? colors[1] : theme.colors.border}`,
        borderRadius: '10px',
        cursor: 'pointer',
        textAlign: 'left',
        transition: 'border-color 0.2s, box-shadow 0.2s, transform 0.15s',
        boxShadow: active ? `0 0 0 3px ${colors[1]}22` : 'none',
        overflow: 'hidden',
      }}
      onMouseEnter={e => {
        if (!active) e.currentTarget.style.borderColor = theme.colors.textMuted;
      }}
      onMouseLeave={e => {
        if (!active) e.currentTarget.style.borderColor = theme.colors.border;
      }}
    >
      {/* Color swatch strip */}
      <div style={{
        display: 'flex',
        height: '48px',
        background: colors[0],
      }}>
        {colors.map((c, i) => (
          <div key={i} style={{
            flex: 1,
            background: c,
            opacity: i === 0 ? 1 : i === 1 ? 0.7 : 0.4,
            borderRight: i < colors.length - 1 ? `1px solid ${colors[0]}` : 'none',
          }} />
        ))}
      </div>
      {/* Label area */}
      <div style={{
        padding: '10px 12px',
        background: colors[0],
      }}>
        <div style={{
          fontSize: '13px',
          fontWeight: 600,
          color: colors[2],
          marginBottom: '2px',
        }}>{label}</div>
        <div style={{
          fontSize: '11px',
          color: colors[2],
          opacity: 0.5,
        }}>{description}</div>
      </div>
      {/* Checkmark */}
      {active && (
        <div style={{
          position: 'absolute',
          top: '8px',
          right: '8px',
          width: '20px',
          height: '20px',
          borderRadius: '50%',
          background: colors[1],
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M2 6l3 3 5-5" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      )}
    </button>
  );
}

// ── Custom range slider ─────────────────────────────────────────────────────

function Slider({ value, min, max, onChange, displayValue, icon }: {
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  displayValue: string;
  icon?: React.ReactNode;
}) {
  const { theme } = useTheme();
  const pct = ((value - min) / (max - min)) * 100;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', width: '100%' }}>
      {icon && <span style={{ color: theme.colors.textMuted, flexShrink: 0 }}>{icon}</span>}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div style={{
          position: 'relative',
          flex: 1,
          height: '6px',
          background: theme.colors.bgTertiary,
          borderRadius: '3px',
          overflow: 'hidden',
          cursor: 'pointer',
        }}>
          <div style={{
            position: 'absolute',
            left: 0,
            top: 0,
            bottom: 0,
            width: `${pct}%`,
            background: `linear-gradient(90deg, ${theme.colors.accent}88, ${theme.colors.accent})`,
            borderRadius: '3px',
            transition: 'width 0.15s ease',
          }} />
          <input
            type="range"
            min={min}
            max={max}
            value={value}
            onChange={e => onChange(Number(e.target.value))}
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              opacity: 0,
              cursor: 'pointer',
              margin: 0,
            }}
          />
        </div>
        <span style={{
          fontSize: '12px',
          color: theme.colors.textMuted,
          minWidth: '40px',
          textAlign: 'right',
          fontVariantNumeric: 'tabular-nums',
        }}>{displayValue}</span>
      </div>
    </div>
  );
}

// ── Settings row ─────────────────────────────────────────────────────────────

function SettingRow({
  icon,
  label,
  description,
  value,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  description?: string;
  value?: string;
  children?: React.ReactNode;
}) {
  const { theme } = useTheme();
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '14px',
      padding: '12px 0',
      borderBottom: `1px solid ${theme.colors.border}22`,
    }}>
      <div style={{
        width: '36px',
        height: '36px',
        borderRadius: '8px',
        background: theme.colors.bgTertiary,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}>
        {icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
        }}>
          <span style={{ fontSize: '13px', fontWeight: 500, color: theme.colors.text }}>{label}</span>
          {value && (
            <span style={{
              fontSize: '11px',
              color: theme.colors.textMuted,
              background: theme.colors.bgTertiary,
              padding: '1px 6px',
              borderRadius: '4px',
              fontVariantNumeric: 'tabular-nums',
            }}>{value}</span>
          )}
        </div>
        {description && (
          <div style={{ fontSize: '11px', color: theme.colors.textMuted, marginTop: '2px' }}>
            {description}
          </div>
        )}
      </div>
      {children}
    </div>
  );
}

// ── Toggle switch ───────────────────────────────────────────────────────────

function Toggle({ checked, onChange, size = 'md' }: {
  checked: boolean;
  onChange: (v: boolean) => void;
  size?: 'sm' | 'md';
}) {
  const { theme } = useTheme();
  const h = size === 'sm' ? '20px' : '22px';
  const w = size === 'sm' ? '36px' : '40px';
  const dot = size === 'sm' ? '14px' : '16px';
  const offset = size === 'sm' ? '3px' : '3px';

  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      style={{
        width: w,
        height: h,
        background: checked ? theme.colors.accent : theme.colors.bgTertiary,
        border: `1px solid ${checked ? theme.colors.accent : theme.colors.border}`,
        borderRadius: h,
        cursor: 'pointer',
        position: 'relative',
        transition: 'background 0.2s, border-color 0.2s, box-shadow 0.2s',
        boxShadow: checked ? `0 0 0 2px ${theme.colors.accent}33` : 'none',
        padding: 0,
        flexShrink: 0,
      }}
    >
      <div style={{
        width: dot,
        height: dot,
        background: '#fff',
        borderRadius: '50%',
        position: 'absolute',
        top: '50%',
        left: checked ? `calc(100% - ${dot} - ${offset})` : `${offset}`,
        transform: 'translateY(-50%)',
        transition: 'left 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
        boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
      }} />
    </button>
  );
}

// ── Main component ──────────────────────────────────────────────────────────

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
    const newShell = e.target.value;
    setSelectedShell(getShellName(newShell));
    setShell(newShell);
  };

  return (
    <div style={{
      height: '100%',
      overflow: 'auto',
      padding: '32px 28px',
      scrollbarWidth: 'thin',
      scrollbarColor: `${theme.colors.border} transparent`,
    }}>
      {/* Header */}
      <div style={{ marginBottom: '32px' }}>
        <h1 style={{
          fontSize: '22px',
          fontWeight: 700,
          color: theme.colors.text,
          margin: '0 0 6px 0',
          letterSpacing: '-0.02em',
        }}>
          Settings
        </h1>
        <p style={{ fontSize: '13px', color: theme.colors.textMuted, margin: 0 }}>
          Customize your DWO experience
        </p>
      </div>

      {/* ── Appearance ── */}
      <section style={{ marginBottom: '32px' }}>
        <h2 style={{
          fontSize: '11px',
          fontWeight: 600,
          color: theme.colors.textMuted,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          marginBottom: '16px',
        }}>
          Appearance
        </h2>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
          gap: '10px',
        }}>
          {themes.map(t => (
            <ThemeCard
              key={t.id}
              {...t}
              active={currentThemeKey === t.id}
              onClick={() => setTheme(t.id)}
            />
          ))}
        </div>
      </section>

      {/* ── Editor ── */}
      <section style={{ marginBottom: '32px' }}>
        <h2 style={{
          fontSize: '11px',
          fontWeight: 600,
          color: theme.colors.textMuted,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          marginBottom: '8px',
        }}>
          Editor
        </h2>
        <div style={{
          background: theme.colors.bgSecondary,
          border: `1px solid ${theme.colors.border}`,
          borderRadius: '12px',
          padding: '4px 0',
        }}>
          <SettingRow
            icon={<IconFont />}
            label="Font Size"
            description="Adjust the editor text size"
            value={`${fontSize}px`}
          >
            <Slider
              value={fontSize}
              min={12}
              max={24}
              onChange={setFontSize}
              displayValue={`${fontSize}px`}
            />
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
      <section style={{ marginBottom: '32px' }}>
        <h2 style={{
          fontSize: '11px',
          fontWeight: 600,
          color: theme.colors.textMuted,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          marginBottom: '8px',
        }}>
          Terminal
        </h2>
        <div style={{
          background: theme.colors.bgSecondary,
          border: `1px solid ${theme.colors.border}`,
          borderRadius: '12px',
          padding: '4px 0',
        }}>
          <SettingRow
            icon={<IconTerminal />}
            label="Default Shell"
            description="Shell used for new terminal sessions"
            value={selectedShell}
          >
            <select
              value={defaultShell}
              onChange={handleShellChange}
              style={{
                background: theme.colors.bgTertiary,
                border: `1px solid ${theme.colors.border}`,
                color: theme.colors.text,
                padding: '6px 10px',
                borderRadius: '6px',
                fontSize: '12px',
                cursor: 'pointer',
                outline: 'none',
              }}
            >
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
            <Slider
              value={transparency}
              min={0}
              max={100}
              onChange={setTransparency}
              displayValue={`${transparency}%`}
            />
          </SettingRow>
        </div>
      </section>
    </div>
  );
}
