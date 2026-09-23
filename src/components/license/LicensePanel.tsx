'use client';

import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useTheme } from '@/contexts/ThemeContext';

type LicenseTier = 'free' | 'pro';

export function LicensePanel() {
  const { theme } = useTheme();
  const [tier, setTier] = useState<LicenseTier>('free');
  const [key, setKey] = useState('');
  const [status, setStatus] = useState<string>('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    checkStatus();
  }, []);

  const checkStatus = async () => {
    try {
      const result = await invoke<LicenseTier>('status');
      setTier(result);
    } catch (error) {
      console.error('Failed to check license:', error);
    }
  };

  const handleActivate = async () => {
    if (!key.trim()) return;
    setLoading(true);
    setStatus('');
    try {
      const activated = await invoke<boolean>('activate', { key, machine_id: null });
      if (activated) {
        setTier('pro');
        setStatus('License activated successfully!');
      } else {
        setStatus('Failed to activate license');
      }
    } catch (error) {
      setStatus(`Activation failed: ${error}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDeactivate = async () => {
    try {
      await invoke<boolean>('deactivate');
      setTier('free');
      setStatus('License deactivated');
    } catch (error) {
      setStatus(`Deactivation failed: ${error}`);
    }
  };

  return (
    <div style={{ padding: '16px' }}>
      <div style={{ fontSize: '14px', fontWeight: 600, color: theme.colors.text, marginBottom: '12px' }}>
        License Status
      </div>

      {/* Current tier */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '12px',
        background: tier === 'pro' ? '#1a3a1a' : theme.colors.bgTertiary,
        border: `1px solid ${tier === 'pro' ? '#4ade80' : theme.colors.border}`,
        borderRadius: '6px',
        marginBottom: '12px',
      }}>
        <span style={{ fontSize: '20px' }}>{tier === 'pro' ? '👑' : '🆓'}</span>
        <div>
          <div style={{ fontSize: '13px', fontWeight: 500, color: tier === 'pro' ? '#4ade80' : theme.colors.text }}>
            {tier === 'pro' ? 'Pro License' : 'Free Tier'}
          </div>
          <div style={{ fontSize: '11px', color: theme.colors.textMuted }}>
            {tier === 'pro' ? 'All features unlocked' : '4 terminals / 2 workspaces'}
          </div>
        </div>
      </div>

      {/* Features list */}
      <div style={{ marginBottom: '16px' }}>
        <div style={{ fontSize: '12px', color: theme.colors.textMuted, marginBottom: '8px' }}>Features:</div>
        <FeatureItem enabled={tier !== 'free'} text="Unlimited terminals" />
        <FeatureItem enabled={tier !== 'free'} text="Unlimited workspaces" />
        <FeatureItem enabled={tier !== 'free'} text="Multi-agent orchestration" />
        <FeatureItem enabled={tier !== 'free'} text="Priority support" />
      </div>

      {/* Activation */}
      {tier === 'free' && (
        <div style={{ borderTop: `1px solid ${theme.colors.border}`, paddingTop: '12px' }}>
          <div style={{ fontSize: '12px', color: theme.colors.text, marginBottom: '8px' }}>
            Activate Pro License
          </div>
          <input
            type="text"
            value={key}
            onChange={e => setKey(e.target.value)}
            placeholder="Enter license key..."
            style={{
              width: '100%',
              background: theme.colors.bg,
              border: `1px solid ${theme.colors.border}`,
              color: theme.colors.text,
              padding: '6px 10px',
              borderRadius: '4px',
              fontSize: '12px',
              marginBottom: '8px',
              boxSizing: 'border-box',
            }}
          />
          <button
            onClick={handleActivate}
            disabled={loading || !key.trim()}
            style={{
              width: '100%',
              background: loading ? theme.colors.textMuted : theme.colors.accent,
              color: '#fff',
              border: 'none',
              padding: '8px',
              borderRadius: '4px',
              cursor: loading ? 'not-allowed' : 'pointer',
              fontSize: '12px',
              fontWeight: 500,
            }}
          >
            {loading ? 'Activating...' : 'Activate License'}
          </button>
        </div>
      )}

      {/* Deactivate (pro only) */}
      {tier === 'pro' && (
        <button
          onClick={handleDeactivate}
          style={{
            width: '100%',
            background: 'transparent',
            color: theme.colors.textMuted,
            border: `1px solid ${theme.colors.border}`,
            padding: '8px',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '11px',
            marginTop: '8px',
          }}
        >
          Deactivate License
        </button>
      )}

      {/* Status message */}
      {status && (
        <div style={{
          marginTop: '8px',
          fontSize: '11px',
          color: status.includes('failed') ? '#f87171' : '#4ade80',
        }}>
          {status}
        </div>
      )}
    </div>
  );
}

function FeatureItem({ enabled, text }: { enabled: boolean; text: string }) {
  const { theme } = useTheme();
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '6px',
      fontSize: '11px',
      color: enabled ? theme.colors.text : theme.colors.textMuted,
      marginBottom: '4px',
    }}>
      <span>{enabled ? '✓' : '✕'}</span>
      <span>{text}</span>
    </div>
  );
}
