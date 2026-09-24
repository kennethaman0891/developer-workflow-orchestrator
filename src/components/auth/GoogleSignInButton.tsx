'use client';

import { useState, useCallback, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { googleOAuthPopup, getGoogleClientId, saveGoogleClientId } from '@/lib/googleOAuth';
import { loadGoogleScript } from '@/lib/gsi';

interface GoogleSignInButtonProps {
  size?: 'large' | 'medium' | 'small';
  fullWidth?: boolean;
}

const SIZES = {
  large: { height: '44px', fontSize: '14px', padding: '0 20px' },
  medium: { height: '36px', fontSize: '13px', padding: '0 16px' },
  small: { height: '28px', fontSize: '12px', padding: '0 12px' },
};

export function GoogleSignInButton({ size = 'large', fullWidth = false }: GoogleSignInButtonProps) {
  const { theme } = useTheme();
  const { signInWithGoogle, signInManually, isLoading } = useAuth();
  const [manualMode, setManualMode] = useState(false);
  const [manualName, setManualName] = useState('');
  const [manualEmail, setManualEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [clientId, setClientId] = useState<string | null>(null);
  const [scriptLoaded, setScriptLoaded] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [configInput, setConfigInput] = useState('');
  const [configError, setConfigError] = useState<string | null>(null);

  // Load saved Client ID on mount
  useEffect(() => {
    const saved = getGoogleClientId();
    setClientId(saved);
    if (saved) {
      loadGoogleScript().then(setScriptLoaded);
    }
  }, []);

  const handleGoogleSignIn = useCallback(async () => {
    setError(null);

    // Check if we have a Client ID
    const id = clientId || getGoogleClientId();
    if (!id) {
      setShowConfig(true);
      return;
    }

    // Try GSI first if script is loaded
    if (scriptLoaded && (window as any).google?.accounts?.oauth2) {
      try {
        const client = (window as any).google.accounts.oauth2.initTokenClient({
          client_id: id,
          scope: 'email profile openid',
          callback: (response: any) => {
            if (response.access_token) {
              fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
                headers: { Authorization: `Bearer ${response.access_token}` },
              })
                .then(r => r.json())
                .then(profile => {
                  signInWithGoogle({
                    email: profile.email,
                    name: profile.name || profile.email?.split('@')[0] || 'User',
                    picture: profile.picture || '',
                  });
                })
                .catch(() => {
                  // Fallback to popup flow
                  handlePopupSignIn(id);
                });
            } else if (response.error) {
              setError(response.error_description || response.error || 'Sign-in failed');
            }
          },
        });
        client.requestAccessToken();
        return;
      } catch (err) {
        console.warn('GSI TokenClient failed, falling back to popup:', err);
      }
    }

    // Fallback to popup flow
    await handlePopupSignIn(id);
  }, [clientId, scriptLoaded, signInWithGoogle]);

  const handlePopupSignIn = useCallback(async (id: string) => {
    setError(null);
    try {
      const result = await googleOAuthPopup(id);
      signInWithGoogle({
        email: result.profile.email,
        name: result.profile.name,
        picture: result.profile.picture,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed');
    }
  }, [signInWithGoogle]);

  const handleSaveConfig = useCallback(() => {
    setConfigError(null);
    const id = configInput.trim();
    if (!id || !id.includes('.')) {
      setConfigError('Please enter a valid Google Client ID');
      return;
    }
    saveGoogleClientId(id);
    setClientId(id);
    setShowConfig(false);
    setConfigInput('');
    // Reload the GSI script
    loadGoogleScript().then(setScriptLoaded);
  }, [configInput]);

  const handleManualSubmit = useCallback(() => {
    setError(null);
    if (!manualName.trim() || !manualEmail.trim()) {
      setError('Name and email are required');
      return;
    }
    if (!manualEmail.includes('@')) {
      setError('Please enter a valid email');
      return;
    }
    signInManually(manualName, manualEmail);
  }, [manualName, manualEmail, signInManually]);

  // Show config modal if no Client ID
  if (showConfig) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', width: fullWidth ? '100%' : undefined }}>
        <div style={{
          padding: '16px',
          background: theme.colors.bgSecondary,
          border: `1px solid ${theme.colors.border}`,
          borderRadius: '10px',
        }}>
          <div style={{ fontSize: '13px', fontWeight: 500, color: theme.colors.text, marginBottom: '6px' }}>
            Configure Google OAuth
          </div>
          <div style={{ fontSize: '11px', color: theme.colors.textMuted, lineHeight: '1.5', marginBottom: '12px' }}>
            To enable real Google sign-in, you need a Google Cloud Client ID.{' '}
            <a
              href="https://console.cloud.google.com/apis/credentials"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: theme.colors.accent, textDecoration: 'none' }}
              onMouseEnter={e => e.currentTarget.style.textDecoration = 'underline'}
              onMouseLeave={e => e.currentTarget.style.textDecoration = 'none'}
            >
              Get one here
            </a>
          </div>
          <input
            type="text"
            placeholder="Enter your Google Client ID"
            value={configInput}
            onChange={e => setConfigInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSaveConfig()}
            style={{
              width: '100%',
              padding: '10px 12px',
              background: theme.colors.bg,
              border: `1px solid ${theme.colors.border}`,
              borderRadius: '6px',
              color: theme.colors.text,
              fontSize: '12px',
              fontFamily: 'monospace',
              outline: 'none',
              boxSizing: 'border-box',
              marginBottom: '8px',
            }}
            autoFocus
          />
          {configError && (
            <div style={{ fontSize: '11px', color: theme.colors.error, marginBottom: '8px' }}>
              {configError}
            </div>
          )}
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={handleSaveConfig}
              style={{
                flex: 1,
                height: '36px',
                background: theme.colors.accent,
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: 500,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              Save & Sign In
            </button>
            <button
              onClick={() => { setShowConfig(false); setConfigError(null); setConfigInput(''); }}
              style={{
                height: '36px',
                padding: '0 12px',
                background: theme.colors.bgTertiary,
                color: theme.colors.textMuted,
                border: `1px solid ${theme.colors.border}`,
                borderRadius: '6px',
                fontSize: '12px',
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (manualMode) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: fullWidth ? '100%' : undefined }}>
        <input
          type="text"
          placeholder="Your name"
          value={manualName}
          onChange={e => setManualName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleManualSubmit()}
          style={{
            width: '100%',
            padding: '10px 12px',
            background: theme.colors.bg,
            border: `1px solid ${theme.colors.border}`,
            borderRadius: '8px',
            color: theme.colors.text,
            fontSize: '13px',
            outline: 'none',
            boxSizing: 'border-box',
          }}
        />
        <input
          type="email"
          placeholder="you@email.com"
          value={manualEmail}
          onChange={e => setManualEmail(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleManualSubmit()}
          style={{
            width: '100%',
            padding: '10px 12px',
            background: theme.colors.bg,
            border: `1px solid ${theme.colors.border}`,
            borderRadius: '8px',
            color: theme.colors.text,
            fontSize: '13px',
            outline: 'none',
            boxSizing: 'border-box',
          }}
        />
        {error && <span style={{ fontSize: '11px', color: theme.colors.error }}>{error}</span>}
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={handleManualSubmit}
            disabled={isLoading}
            style={{
              flex: 1,
              height: SIZES[size].height,
              padding: SIZES[size].padding,
              background: theme.colors.accent,
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              fontSize: SIZES[size].fontSize,
              fontWeight: 500,
              cursor: isLoading ? 'not-allowed' : 'pointer',
              opacity: isLoading ? 0.6 : 1,
              fontFamily: 'inherit',
            }}
          >
            {isLoading ? 'Signing in...' : 'Continue'}
          </button>
          <button
            onClick={() => { setManualMode(false); setError(null); }}
            style={{
              height: SIZES[size].height,
              padding: SIZES[size].padding,
              background: theme.colors.bgSecondary,
              color: theme.colors.textMuted,
              border: `1px solid ${theme.colors.border}`,
              borderRadius: '8px',
              fontSize: SIZES[size].fontSize,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: fullWidth ? '100%' : undefined }}>
      {/* Primary Google Sign-In */}
      <button
        onClick={handleGoogleSignIn}
        disabled={isLoading}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '10px',
          height: SIZES[size].height,
          padding: SIZES[size].padding,
          background: '#fff',
          border: 'none',
          borderRadius: '8px',
          cursor: isLoading ? 'not-allowed' : 'pointer',
          opacity: isLoading ? 0.6 : 1,
          width: fullWidth ? '100%' : undefined,
          fontFamily: 'inherit',
        }}
      >
        {/* Google "G" logo */}
        <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
          <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z" fill="#4285F4" />
          <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.704H.957v2.332A8.997 8.997 0 0 0 9 18Z" fill="#34A853" />
          <path d="M3.964 10.717A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.717V4.95H.957A8.997 8.997 0 0 0 0 9c0 1.452.348 2.827.957 4.05l3.007-2.333Z" fill="#FBBC05" />
          <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.95l3.007 2.332C4.672 5.164 6.656 3.58 9 3.58Z" fill="#EA4335" />
        </svg>
        <span style={{ color: '#1f1f1f', fontWeight: 500, fontSize: SIZES[size].fontSize, fontFamily: 'inherit' }}>
          Sign in with Google
        </span>
      </button>

      {/* Divider */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div style={{ flex: 1, height: '1px', background: theme.colors.border }} />
        <span style={{ fontSize: '11px', color: theme.colors.textMuted }}>or</span>
        <div style={{ flex: 1, height: '1px', background: theme.colors.border }} />
      </div>

      {/* Manual sign-in toggle */}
      <button
        onClick={() => setManualMode(true)}
        style={{
          height: SIZES[size].height,
          padding: SIZES[size].padding,
          background: 'transparent',
          border: `1px solid ${theme.colors.border}`,
          borderRadius: '8px',
          color: theme.colors.textMuted,
          fontSize: SIZES[size].fontSize,
          cursor: 'pointer',
          fontFamily: 'inherit',
          width: fullWidth ? '100%' : undefined,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px',
          transition: 'color 0.15s, border-color 0.15s',
        }}
        onMouseEnter={e => {
          e.currentTarget.style.color = theme.colors.text;
          e.currentTarget.style.borderColor = theme.colors.textMuted;
        }}
        onMouseLeave={e => {
          e.currentTarget.style.color = theme.colors.textMuted;
          e.currentTarget.style.borderColor = theme.colors.border;
        }}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M7 1.75a5.25 5.25 0 1 0 0 10.5A5.25 5.25 0 0 0 7 1.75zM2.25 7a4.75 4.75 0 1 1 9.5 0 4.75 4.75 0 0 1-9.5 0z" fill="currentColor" />
          <path d="M7 3.5a.75.75 0 0 1 .75.75v2.5a.75.75 0 0 1-1.5 0V4.25A.75.75 0 0 1 7 3.5z" fill="currentColor" />
          <path d="M7 9.75a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5z" fill="currentColor" />
        </svg>
        Continue with email
      </button>

      {error && (
        <div style={{ fontSize: '11px', color: theme.colors.error, textAlign: 'center' }}>
          {error}
        </div>
      )}

      <p style={{ fontSize: '10px', color: theme.colors.textMuted, margin: 0, textAlign: 'center' }}>
        {!clientId
          ? 'Configure Google OAuth in settings for real sign-in, or use email below.'
          : 'Sign in to collaborate in real-time. Your data stays local.'
        }
      </p>
    </div>
  );
}
