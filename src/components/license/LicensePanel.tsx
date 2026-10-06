'use client';

import { useState, useEffect } from 'react';
import { invoke } from '@/lib/tauri';

type LicenseTier = 'free' | 'pro';

export function LicensePanel() {
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
      <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--dwo-color-text)', marginBottom: '12px' }}>
        License Status
      </div>

      {/* Current tier */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '12px',
        background: tier === 'pro' ? `var(--dwo-color-success)18` : 'var(--dwo-color-bg-tertiary)',
        border: `1px solid ${tier === 'pro' ? 'var(--dwo-color-success)' : 'var(--dwo-color-border)'}`,
        borderRadius: 'var(--dwo-radius-sm)',
        marginBottom: '12px',
      }}>
        <span style={{ fontSize: '20px' }}>{tier === 'pro' ? '👑' : '🆓'}</span>
        <div>
          <div style={{ fontSize: '13px', fontWeight: 500, color: tier === 'pro' ? 'var(--dwo-color-success)' : 'var(--dwo-color-text)' }}>
            {tier === 'pro' ? 'Pro License' : 'Free Tier'}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--dwo-color-text-muted)' }}>
            {tier === 'pro' ? 'All features unlocked' : '4 terminals / 2 workspaces'}
          </div>
        </div>
      </div>

      {/* Features list */}
      <div style={{ marginBottom: '16px' }}>
        <div style={{ fontSize: '12px', color: 'var(--dwo-color-text-muted)', marginBottom: '8px' }}>Features:</div>
        <FeatureItem enabled={tier !== 'free'} text="Unlimited terminals" />
        <FeatureItem enabled={tier !== 'free'} text="Unlimited workspaces" />
        <FeatureItem enabled={tier !== 'free'} text="Multi-agent orchestration" />
        <FeatureItem enabled={tier !== 'free'} text="Priority support" />
      </div>

      {/* Activation */}
      {tier === 'free' && (
        <div style={{ borderTop: `1px solid var(--dwo-color-border)`, paddingTop: '12px' }}>
          <div style={{ fontSize: '12px', color: 'var(--dwo-color-text)', marginBottom: '8px' }}>
            Activate Pro License
          </div>
          <input
            type="text"
            value={key}
            onChange={e => setKey(e.target.value)}
            placeholder="Enter license key..."
            style={{
              width: '100%',
              background: 'var(--dwo-color-bg)',
              border: `1px solid var(--dwo-color-border)`,
              color: 'var(--dwo-color-text)',
              padding: '6px 10px',
              borderRadius: 'var(--dwo-radius-sm)',
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
              background: loading ? 'var(--dwo-color-text-muted)' : 'var(--dwo-color-accent)',
              color: '#fff',
              border: 'none',
              padding: '8px',
              borderRadius: 'var(--dwo-radius-sm)',
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
            color: 'var(--dwo-color-text-muted)',
            border: `1px solid var(--dwo-color-border)`,
            padding: '8px',
            borderRadius: 'var(--dwo-radius-sm)',
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
          color: status.includes('failed') ? 'var(--dwo-color-error)' : 'var(--dwo-color-success)',
        }}>
          {status}
        </div>
      )}
    </div>
  );
}

function FeatureItem({ enabled, text }: { enabled: boolean; text: string }) {
    return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '6px',
      fontSize: '11px',
      color: enabled ? 'var(--dwo-color-text)' : 'var(--dwo-color-text-muted)',
      marginBottom: '4px',
    }}>
      <span>{enabled ? '✓' : '✕'}</span>
      <span>{text}</span>
    </div>
  );
}
