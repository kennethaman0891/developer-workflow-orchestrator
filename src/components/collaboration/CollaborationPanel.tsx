'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth, type User } from '@/contexts/AuthContext';
import { GoogleSignInButton } from '@/components/auth/GoogleSignInButton';

// ── Types & constants ────────────────────────────────────────────────────────

type AuthStep = 'login' | 'register' | 'verify';

interface FormData {
  name: string;
  email: string;
  password: string;
  confirmPassword: string;
  verificationCode: string;
}

interface FieldErrors {
  name?: string;
  email?: string;
  password?: string;
  confirmPassword?: string;
  verificationCode?: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function maskEmail(email: string): string {
  const idx = email.indexOf('@');
  if (idx === -1) return email;
  const local = email.slice(0, idx);
  const domain = email.slice(idx + 1);
  const masked = local.length <= 2 ? local[0] + '•••' : local[0] + '•••' + local[local.length - 1];
  return `${masked}@${domain}`;
}

function validateEmail(email: string): string | null {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'Please enter a valid email address';
  return null;
}

function validatePassword(pw: string): string | null {
  if (pw.length < 8) return 'Password must be at least 8 characters';
  if (!/[a-zA-Z]/.test(pw)) return 'Password must contain at least one letter';
  if (!/[0-9]/.test(pw)) return 'Password must contain at least one number';
  return null;
}

function getRadius(isCarbon: boolean, isOcean: boolean): string {
  if (isCarbon) return '2px';
  if (isOcean) return '8px';
  return '10px';
}

// ── Sub-components ───────────────────────────────────────────────────────────

/** Generic input field with label, optional error, focus tracking, and trailing content. */
function Field({
  id, label, type = 'text', value, onChange, onBlur, error, touched, placeholder,
  trailing, inputMode, autoFocus, onKeyDown, maxLength,
}: {
  id: string; label: string; type?: 'text' | 'email' | 'password'; value: string;
  onChange: (v: string) => void; onBlur?: () => void;
  error?: string; touched?: boolean; placeholder?: string;
  trailing?: React.ReactNode; inputMode?: 'text' | 'numeric' | 'email';
  autoFocus?: boolean; onKeyDown?: (e: React.KeyboardEvent) => void;
  maxLength?: number; autoComplete?: string;
}) {
  const { theme } = useTheme();
  const [focused, setFocused] = useState(false);
  const showError = touched && !!error;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
      <label
        htmlFor={id}
        style={{
          fontSize: '11px',
          fontWeight: 500,
          color: theme.colors.textMuted,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
        }}
      >
        {label}
      </label>
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
        <input
          id={id}
          type={type}
          value={value}
          inputMode={inputMode}
          maxLength={maxLength}
          autoCapitalize="none"
          autoComplete={type === 'password' ? 'current-password' : undefined}
          placeholder={placeholder}
          autoFocus={autoFocus}
          onChange={e => onChange(e.target.value)}
          onBlur={() => { setFocused(false); onBlur?.(); }}
          onFocus={() => setFocused(true)}
          onKeyDown={onKeyDown}
          style={{
            width: '100%',
            padding: trailing ? '10px 42px 10px 12px' : '10px 12px',
            background: theme.colors.bg,
            border: `1.5px solid ${showError ? theme.colors.error : focused ? theme.colors.accent : theme.colors.border}`,
            borderRadius: getRadius(theme.fonts.monospace.includes('IBM'), theme.fonts.monospace.includes('Dracula')),
            color: theme.colors.text,
            fontSize: '13px',
            fontFamily: 'inherit',
            outline: 'none',
            boxSizing: 'border-box',
            transition: 'border-color 0.15s ease',
            ...(type === 'password' ? { letterSpacing: '0.04em' } : {}),
          }}
        />
        {trailing && (
          <div style={{ position: 'absolute', right: '10px', display: 'flex', alignItems: 'center' }}>
            {trailing}
          </div>
        )}
      </div>
      {showError && (
        <span role="alert" style={{ fontSize: '11px', color: theme.colors.error, lineHeight: '1.3' }}>
          {error}
        </span>
      )}
    </div>
  );
}

/** Primary action button (full-width). */
function ActionButton({
  children, onClick, disabled, loading,
}: {
  children: React.ReactNode; onClick: () => void;
  disabled?: boolean; loading?: boolean;
}) {
  const { theme } = useTheme();
  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      style={{
        width: '100%',
        height: '42px',
        background: theme.colors.accent,
        color: '#fff',
        border: 'none',
        borderRadius: getRadius(theme.fonts.monospace.includes('IBM'), theme.fonts.monospace.includes('Dracula')),
        fontSize: '13px',
        fontWeight: 600,
        cursor: disabled || loading ? 'not-allowed' : 'pointer',
        opacity: disabled || loading ? 0.6 : 1,
        fontFamily: 'inherit',
        letterSpacing: '0.01em',
        transition: 'background 0.15s ease, opacity 0.15s ease',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '8px',
      }}
      onMouseEnter={e => {
        if (!disabled && !loading) e.currentTarget.style.background = theme.colors.accentHover;
      }}
      onMouseLeave={e => {
        if (!disabled && !loading) e.currentTarget.style.background = theme.colors.accent;
      }}
    >
      {loading && (
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ animation: 'spin 0.8s linear infinite' }}>
          <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.5" strokeDasharray="22" strokeDashoffset="6" strokeLinecap="round" />
        </svg>
      )}
      {children}
    </button>
  );
}

/** Link-style button for secondary actions. */
function LinkButton({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  const { theme } = useTheme();
  return (
    <button
      onClick={onClick}
      style={{
        background: 'none',
        border: 'none',
        padding: '0',
        color: theme.colors.accent,
        fontSize: '12px',
        cursor: 'pointer',
        fontFamily: 'inherit',
        textDecoration: 'none',
        transition: 'color 0.12s',
      }}
      onMouseEnter={e => e.currentTarget.style.color = theme.colors.accentHover}
      onMouseLeave={e => e.currentTarget.style.color = theme.colors.accent}
    >
      {children}
    </button>
  );
}

// ── Auth Card ────────────────────────────────────────────────────────────────

function AuthCard() {
  const { theme, currentThemeKey } = useTheme();
  const { registerUser, signInWithEmail, verifyEmail, resendVerificationCode, pendingUser, verification } = useAuth();

  const [step, setStep] = useState<AuthStep>('login');
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [data, setData] = useState<FormData>({
    name: '', email: '', password: '', confirmPassword: '', verificationCode: '',
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [touched, setTouched] = useState<Partial<Record<keyof FormData, boolean>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitErr, setSubmitErr] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(30);
  /** Local copy of email to show in verify step even when context clears verification on expiration. */
  const [verifyEmailAddr, setVerifyEmailAddr] = useState('');
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Auto-transition to verify when context has issued a code
  useEffect(() => {
    if (verification?.freshCode && step !== 'verify') {
      setStep('verify');
      setResendIn(30);
    }
  }, [verification?.freshCode]);

  // Focus OTP input when entering verify step
  useEffect(() => {
    if (step === 'verify') {
      setTimeout(() => {
        const el = document.getElementById('otp-code');
        el?.focus();
      }, 50);
    }
  }, [step]);

  // Countdown timer for resend
  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (step !== 'verify') return;
    intervalRef.current = setInterval(() => {
      setResendIn(prev => {
        if (prev <= 1) { clearInterval(intervalRef.current!); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [step]);

  // Reset form state when toggling between login/register
  const switchMode = useCallback((m: 'login' | 'register') => {
    setMode(m);
    setStep('login');
    setData(d => ({ ...d, name: '', email: '', password: '', confirmPassword: '' }));
    setErrors({});
    setTouched({});
    setSubmitErr(null);
    setResendIn(30);
  }, []);

  const updateField = useCallback(<K extends keyof FormData>(key: K, value: string) => {
    setData(prev => ({ ...prev, [key]: value }));
    if (errors[key]) {
      setErrors(prev => { const next = { ...prev }; delete next[key]; return next; });
    }
  }, [errors]);

  const blurField = useCallback(<K extends keyof FormData>(key: K) => {
    setTouched(prev => ({ ...prev, [key]: true }));
    const v = data[key];
    if (key === 'email' && v) {
      const err = validateEmail(v);
      if (err) setErrors(prev => ({ ...prev, email: err }));
      else setErrors(prev => { const n = { ...prev }; delete n.email; return n; });
    }
    if (key === 'password' && v) {
      const err = validatePassword(v);
      if (err) setErrors(prev => ({ ...prev, password: err }));
      else setErrors(prev => { const n = { ...prev }; delete n.password; return n; });
    }
    if (key === 'name' && v) {
      if (v.trim().length < 2) setErrors(prev => ({ ...prev, name: 'Name must be at least 2 characters' }));
      else setErrors(prev => { const n = { ...prev }; delete n.name; return n; });
    }
    if (key === 'confirmPassword' && v) {
      if (v !== data.password) setErrors(prev => ({ ...prev, confirmPassword: 'Passwords do not match' }));
      else setErrors(prev => { const n = { ...prev }; delete n.confirmPassword; return n; });
    }
  }, [data]);

  const handleRegister = useCallback(async () => {
    setSubmitErr(null);
    const nameErr = data.name.trim().length < 2 ? 'Name must be at least 2 characters' : null;
    const emailErr = validateEmail(data.email);
    const pwErr = validatePassword(data.password);
    const confirmErr = data.password !== data.confirmPassword ? 'Passwords do not match' : null;
    const errs: FieldErrors = {};
    if (nameErr) errs.name = nameErr;
    if (emailErr) errs.email = emailErr;
    if (pwErr) errs.password = pwErr;
    if (confirmErr) errs.confirmPassword = confirmErr;
    setErrors(errs);
    setTouched({ name: true, email: true, password: true, confirmPassword: true });
    if (Object.keys(errs).length) return;

    setSubmitting(true);
    const result = await registerUser(data.name.trim(), data.email.trim(), data.password);
    setSubmitting(false);
    if (!result.ok) setSubmitErr(result.error);
    // If ok, verification context will issue code → effect above flips to verify step
  }, [data, registerUser]);

  const handleLogin = useCallback(async () => {
    setSubmitErr(null);
    const emailErr = validateEmail(data.email);
    const pwErr = data.password ? null : 'Please enter your password';
    const errs: FieldErrors = {};
    if (emailErr) errs.email = emailErr;
    if (pwErr) errs.password = pwErr;
    setErrors(errs);
    setTouched({ email: true, password: true });
    if (Object.keys(errs).length) return;

    setSubmitting(true);
    const result = await signInWithEmail(data.email.trim(), data.password);
    setSubmitting(false);
    if (!result.ok) {
      if (result.error === 'unverified') {
        // Store email locally so we can show masked version in verify step
        setVerifyEmailAddr(data.email.trim());
      } else {
        setSubmitErr(result.error);
      }
    }
  }, [data, signInWithEmail]);

  const handleVerify = useCallback(async () => {
    setSubmitErr(null);
    const trimmed = data.verificationCode.trim();
    if (!/^\d{6}$/.test(trimmed)) {
      setErrors(prev => ({ ...prev, verificationCode: 'Please enter the 6-digit code' }));
      return;
    }
    setErrors(prev => { const n = { ...prev }; delete n.verificationCode; return n; });
    setSubmitting(true);
    const result = await verifyEmail(trimmed);
    setSubmitting(false);
    if (!result.ok) setSubmitErr(result.error);
  }, [data.verificationCode, verifyEmail]);

  const handleResend = useCallback(async () => {
    setSubmitErr(null);
    setResendIn(30);
    await resendVerificationCode();
    setData(d => ({ ...d, verificationCode: '' }));
    setErrors(prev => { const n = { ...prev }; delete n.verificationCode; return n; });
  }, [resendVerificationCode]);

  const handleVerifyKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleVerify();
  }, [handleVerify]);

  const isCarbon = currentThemeKey === 'carbon';
  const isOcean = currentThemeKey === 'ocean';
  const radius = getRadius(isCarbon, isOcean);

  // Step icon based on current step
  const stepIcon = (() => {
    if (step === 'verify') {
      return (
        <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
          <rect x="3" y="7" width="22" height="16" rx="3" stroke={theme.colors.accent} strokeWidth="1.8" fill="none" />
          <path d="M3 10l11 7 11-7" stroke={theme.colors.accent} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </svg>
      );
    }
    if (mode === 'register') {
      return (
        <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
          <circle cx="14" cy="9" r="5" stroke={theme.colors.accent} strokeWidth="1.8" fill="none" />
          <path d="M5 23c0-4.97 4.03-9 9-9s9 4.03 9 9" stroke={theme.colors.accent} strokeWidth="1.8" strokeLinecap="round" fill="none" />
          <path d="M20 6l4 4-4 4" stroke={theme.colors.accent} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          <line x1="24" y1="10" x2="16" y2="10" stroke={theme.colors.accent} strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      );
    }
    // default: login
    return (
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
        <circle cx="14" cy="10" r="5" stroke={theme.colors.accent} strokeWidth="1.8" fill="none" />
        <path d="M5 23c0-4.97 4.03-9 9-9s9 4.03 9 9" stroke={theme.colors.accent} strokeWidth="1.8" strokeLinecap="round" fill="none" />
        <path d="M19 18h4M21 16v4" stroke={theme.colors.accent} strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  })();

  return (
    <div style={{
      padding: '32px',
      background: theme.colors.bgSecondary,
      border: `1px solid ${theme.colors.border}`,
      borderRadius: radius,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: '20px',
      maxWidth: '440px',
      width: '100%',
      alignSelf: 'center',
      boxShadow: `0 8px 32px ${theme.colors.bg}80`,
    }}>
      {/* Header icon */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
        <div style={{
          width: '64px', height: '64px',
          borderRadius: '50%',
          background: `linear-gradient(135deg, ${theme.colors.accent}22, ${theme.colors.accent}11)`,
          border: `2px solid ${theme.colors.accent}44`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {stepIcon}
        </div>
        <div style={{ textAlign: 'center' }}>
          <h2 style={{ fontSize: '16px', fontWeight: 600, color: theme.colors.text, margin: '0 0 4px 0' }}>
            {step === 'verify' ? 'Verify Your Email'
             : mode === 'register' ? 'Create Your Account'
             : 'Welcome Back'}
          </h2>
          <p style={{ fontSize: '12px', color: theme.colors.textMuted, margin: 0, lineHeight: '1.5' }}>
            {step === 'verify' ? 'We sent a 6-digit code to your inbox.'
             : mode === 'register' ? 'Join DWO to collaborate in real-time.'
             : 'Sign in to access collaborative editing features.'}
          </p>
        </div>
      </div>

      {/* Google sign-in */}
      <div style={{ width: '100%' }}>
        <GoogleSignInButton size="large" fullWidth />
      </div>

      {/* Divider */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', width: '100%' }}>
        <div style={{ flex: 1, height: '1px', background: theme.colors.border }} />
        <span style={{ fontSize: '11px', color: theme.colors.textMuted, textTransform: 'uppercase', letterSpacing: '0.08em' }}>or continue with email</span>
        <div style={{ flex: 1, height: '1px', background: theme.colors.border }} />
      </div>

      {/* Mode toggle tabs */}
      {step !== 'verify' && (
        <div style={{
          display: 'flex',
          width: '100%',
          background: theme.colors.bg,
          borderRadius: isCarbon ? '2px' : '10px',
          padding: '4px',
          gap: '4px',
        }}>
          {(['login', 'register'] as const).map(m => (
            <button
              key={m}
              onClick={() => switchMode(m)}
              style={{
                flex: 1,
                height: '34px',
                background: mode === m ? theme.colors.accent : 'transparent',
                color: mode === m ? '#fff' : theme.colors.textMuted,
                border: 'none',
                borderRadius: isCarbon ? '2px' : '8px',
                fontSize: '12px',
                fontWeight: mode === m ? 600 : 400,
                cursor: 'pointer',
                fontFamily: 'inherit',
                transition: 'all 0.15s ease',
              }}
            >
              {m === 'login' ? 'Sign In' : 'Create Account'}
            </button>
          ))}
        </div>
      )}

      {/* Submit error banner */}
      {submitErr && (
        <div role="alert" style={{
          width: '100%',
          padding: '10px 12px',
          background: `${theme.colors.error}15`,
          border: `1px solid ${theme.colors.error}30`,
          borderRadius: radius,
          fontSize: '12px',
          color: theme.colors.error,
          lineHeight: '1.4',
        }}>
          {submitErr}
        </div>
      )}

      {/* Verification step */}
      {step === 'verify' && (
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {/* Masked email info */}
          <div style={{ textAlign: 'center', fontSize: '12px', color: theme.colors.textMuted }}>
            We sent a 6-digit code to{' '}
            <span style={{ color: theme.colors.text, fontFamily: 'monospace' }}>
              {maskEmail(verifyEmailAddr || verification?.email || 'your email')}
            </span>
          </div>

          {/* Demo mode stub banner */}
          {verification?.freshCode && (
            <div style={{
              padding: '10px 12px',
              background: `${theme.colors.warning}15`,
              border: `1px dashed ${theme.colors.warning}40`,
              borderRadius: radius,
              fontSize: '11px',
              color: theme.colors.textMuted,
              textAlign: 'center',
              lineHeight: '1.5',
            }}>
              <span style={{ color: theme.colors.warning, fontWeight: 500 }}>Demo mode</span> — mail service not connected yet.{' '}
              Your verification code:{' '}
              <span style={{ fontFamily: 'monospace', fontSize: '13px', color: theme.colors.accent, fontWeight: 600, letterSpacing: '0.1em' }}>
                {verification.freshCode}
              </span>
            </div>
          )}

          {/* OTP input */}
          <Field
            id="otp-code"
            label="Verification Code"
            value={data.verificationCode}
            onChange={v => updateField('verificationCode', v.replace(/\D/g, '').slice(0, 6))}
            error={errors.verificationCode}
            touched={!!touched.verificationCode}
            placeholder="Enter 6-digit code"
            inputMode="numeric"
            autoFocus
            onKeyDown={handleVerifyKeyDown}
            maxLength={6}
          />

          {/* Resend link */}
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            {resendIn > 0 ? (
              <span style={{ fontSize: '11px', color: theme.colors.textMuted }}>
                Resend code in <span style={{ fontFamily: 'monospace', color: theme.colors.accent }}>{resendIn}s</span>
              </span>
            ) : (
              <LinkButton onClick={handleResend}>Resend code</LinkButton>
            )}
          </div>

          {/* Back to login */}
          <div style={{ textAlign: 'center' }}>
            <LinkButton onClick={() => { setStep('login'); setResendIn(30); setData(d => ({ ...d, verificationCode: '' })); setSubmitErr(null); }}>
              ← Back to sign in
            </LinkButton>
          </div>
        </div>
      )}

      {/* Login / Register forms */}
      {step !== 'verify' && (
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {mode === 'register' && (
            <Field
              id="reg-name"
              label="Full Name"
              value={data.name}
              onChange={v => updateField('name', v)}
              onBlur={() => blurField('name')}
              error={errors.name}
              touched={!!touched.name}
              placeholder="John Doe"
            />
          )}
          <Field
            id={mode === 'register' ? 'reg-email' : 'login-email'}
            label="Email Address"
            type="email"
            value={data.email}
            onChange={v => updateField('email', v)}
            onBlur={() => blurField('email')}
            error={errors.email}
            touched={!!touched.email}
            placeholder="you@example.com"
            autoComplete="email"
          />
          <Field
            id={mode === 'register' ? 'reg-pw' : 'login-pw'}
            label="Password"
            type="password"
            value={data.password}
            onChange={v => updateField('password', v)}
            onBlur={() => blurField('password')}
            error={errors.password}
            touched={!!touched.password}
            placeholder={mode === 'register' ? 'Min 8 chars, 1 letter & 1 number' : 'Enter your password'}
            autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
          />
          {mode === 'register' && (
            <Field
              id="reg-confirm"
              label="Confirm Password"
              type="password"
              value={data.confirmPassword}
              onChange={v => updateField('confirmPassword', v)}
              onBlur={() => blurField('confirmPassword')}
              error={errors.confirmPassword}
              touched={!!touched.confirmPassword}
              placeholder="Re-enter your password"
              autoComplete="new-password"
            />
          )}

          {/* Forgot password stub */}
          {mode === 'login' && (
            <div style={{ textAlign: 'right' }}>
              <LinkButton onClick={() => alert('Password reset is not implemented yet. Contact support.')}>
                Forgot password?
              </LinkButton>
            </div>
          )}

          <ActionButton
            onClick={mode === 'register' ? handleRegister : handleLogin}
            loading={submitting}
          >
            {mode === 'register' ? 'Create Account' : 'Sign In'}
          </ActionButton>
        </div>
      )}

      {/* Legal footer */}
      <div style={{ fontSize: '10px', color: theme.colors.textMuted, textAlign: 'center', maxWidth: '320px', lineHeight: '1.5' }}>
        By continuing, you agree to the DWO Terms of Service and Privacy Policy.
        <br />
        Your data stays local unless you explicitly share it.
      </div>
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

export function CollaborationPanel({ workspaceName = 'Current Workspace' }: { workspaceName?: string }) {
  const { theme, currentThemeKey } = useTheme();
  const {
    currentUser,
    collaborators,
    invitationCode,
    generateInviteCode,
    kickCollaborator,
  } = useAuth();

  const [copied, setCopied] = useState(false);

  // Simulated comments for the UI
  const [comments] = useState<Array<{ id: string; user: string; text: string; resolved: boolean }>>([
    { id: '1', user: 'Sarah Chen', text: 'Consider refactoring this function', resolved: false },
  ]);

  const handleGenerateInvite = useCallback(() => {
    generateInviteCode();
  }, [generateInviteCode]);

  const handleCopyCode = useCallback(() => {
    if (invitationCode) {
      navigator.clipboard.writeText(invitationCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [invitationCode]);

  const allUsers = currentUser ? [currentUser, ...collaborators] : collaborators;
  const onlineCount = allUsers.length;
  const isCarbon = currentThemeKey === 'carbon';
  const radius = getRadius(isCarbon, currentThemeKey === 'ocean');

  return (
    <div style={{ flex: 1, display: 'flex', overflow: 'hidden', background: theme.colors.bg }}>
      {/* Main content */}
      <div style={{ flex: 1, padding: '24px', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {/* Header */}
        <div>
          <h1 style={{ fontSize: '20px', fontWeight: 600, color: theme.colors.text, margin: '0 0 4px 0' }}>
            Collaborative Editing
          </h1>
          <p style={{ fontSize: '13px', color: theme.colors.textMuted, margin: 0 }}>
            Real-time collaboration · {workspaceName}
          </p>
        </div>

        {/* Auth state: Show sign-in CTA or collaborative tools */}
        {!currentUser ? (
          <AuthCard />
        ) : (
          <>
            {/* Active collaborators */}
            <div>
              <div style={{ fontSize: '12px', color: theme.colors.textMuted, marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Active Collaborators ({onlineCount})
              </div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {allUsers.map(user => (
                  <div key={user.id} style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '6px 10px 6px 6px',
                    background: theme.colors.bgSecondary,
                    border: `1px solid ${theme.colors.border}`,
                    borderRadius: '20px',
                    position: 'relative',
                  }}>
                    <img
                      src={user.avatar && !user.avatar.startsWith('data:') ? user.avatar : getUserAvatar(user)}
                      alt={user.name}
                      style={{
                        width: '24px',
                        height: '24px',
                        borderRadius: '50%',
                        objectFit: 'cover',
                      }}
                    />
                    <span style={{ fontSize: '12px', color: theme.colors.text }}>{user.name}</span>
                    {user.role === 'owner' && (
                      <span style={{
                        fontSize: '9px',
                        background: theme.colors.accent,
                        color: '#fff',
                        padding: '1px 4px',
                        borderRadius: '4px',
                      }}>
                        OWNER
                      </span>
                    )}
                    <span style={{ width: '6px', height: '6px', background: '#4ade80', borderRadius: '50%' }} title="Online" />
                    {/* Kick button for owner */}
                    {currentUser.role === 'owner' && user.id !== currentUser.id && (
                      <button
                        onClick={() => kickCollaborator(user.id)}
                        style={{
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          color: theme.colors.textMuted,
                          padding: '2px',
                          lineHeight: 1,
                          marginLeft: '2px',
                          opacity: 0.5,
                          transition: 'opacity 0.15s',
                        }}
                        onMouseEnter={e => e.currentTarget.style.opacity = '1'}
                        onMouseLeave={e => e.currentTarget.style.opacity = '0.5'}
                        title="Remove collaborator"
                      >
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                          <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                        </svg>
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Invite section */}
            <div style={{
              padding: '16px',
              background: theme.colors.bgSecondary,
              border: `1px solid ${theme.colors.border}`,
              borderRadius: radius,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 500, color: theme.colors.text }}>Invite collaborators</div>
                  <div style={{ fontSize: '11px', color: theme.colors.textMuted, marginTop: '2px' }}>
                    Share this code so others can join your workspace
                  </div>
                </div>
                <button
                  onClick={handleGenerateInvite}
                  style={{
                    background: theme.colors.accent,
                    color: '#fff',
                    border: 'none',
                    padding: '6px 12px',
                    borderRadius: radius,
                    fontSize: '12px',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = theme.colors.accentHover}
                  onMouseLeave={e => e.currentTarget.style.background = theme.colors.accent}
                >
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path d="M6 1v10M1 6h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                  New Code
                </button>
              </div>

              {invitationCode && (
                <div style={{ display: 'flex', gap: '8px' }}>
                  <div style={{
                    flex: 1,
                    padding: '10px 12px',
                    background: theme.colors.bg,
                    border: `1px solid ${theme.colors.border}`,
                    borderRadius: radius,
                    fontFamily: 'monospace',
                    fontSize: '16px',
                    fontWeight: 600,
                    color: theme.colors.accent,
                    letterSpacing: '0.1em',
                    textAlign: 'center',
                  }}>
                    {invitationCode}
                  </div>
                  <button
                    onClick={handleCopyCode}
                    style={{
                      padding: '10px 14px',
                      background: theme.colors.bgTertiary,
                      border: `1px solid ${theme.colors.border}`,
                      borderRadius: radius,
                      color: theme.colors.text,
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      fontSize: '12px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      transition: 'background 0.15s',
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = theme.colors.border}
                    onMouseLeave={e => e.currentTarget.style.background = theme.colors.bgTertiary}
                  >
                    {copied ? (
                      <>
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                          <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        Copied
                      </>
                    ) : (
                      <>
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                          <rect x="3" y="3" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="1.2" />
                          <path d="M9 2H2v7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                        </svg>
                        Copy
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>

            {/* Code editor area */}
            <div style={{
              padding: '16px',
              background: theme.colors.bgSecondary,
              border: `1px solid ${theme.colors.border}`,
              borderRadius: radius,
              fontFamily: 'monospace',
              fontSize: '13px',
              color: theme.colors.textMuted,
              minHeight: '200px',
              flex: 1,
            }}>
              <div><span style={{ color: '#c678dd' }}>import</span> <span style={{ color: '#e5c07b' }}>React</span> <span style={{ color: '#c678dd' }}>from</span> <span style={{ color: '#98c379' }}>'react'</span>;</div>
              <div></div>
              <div><span style={{ color: '#c678dd' }}>export default function</span> <span style={{ color: '#61afef' }}>App</span>() {'{'} //</div>
              <div style={{ position: 'relative' }}>
                <span style={{ color: theme.colors.text }}>  // Collaborative editing in progress...</span>
                <div style={{
                  position: 'absolute',
                  left: '100%',
                  top: 0,
                  width: '8px',
                  height: '16px',
                  background: '#e06c75',
                  animation: 'blink 1s infinite',
                }} />
              </div>
              <div>{'}'}</div>
            </div>
          </>
        )}
      </div>

      {/* Right sidebar - Comments */}
      <div style={{
        width: '280px',
        borderLeft: `1px solid ${theme.colors.border}`,
        overflow: 'auto',
        padding: '16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
      }}>
        <div style={{ fontSize: '13px', fontWeight: 600, color: theme.colors.text }}>
          Comments ({comments.length})
        </div>

        {comments.map(comment => (
          <div key={comment.id} style={{
            padding: '12px',
            background: theme.colors.bgSecondary,
            border: `1px solid ${theme.colors.border}`,
            borderRadius: radius,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
              <span style={{ fontSize: '11px', fontWeight: 500, color: theme.colors.text }}>{comment.user}</span>
              {!comment.resolved && <span style={{ fontSize: '9px', color: theme.colors.accent }}>OPEN</span>}
            </div>
            <div style={{ fontSize: '11px', color: theme.colors.textMuted }}>{comment.text}</div>
          </div>
        ))}

        {currentUser && (
          <textarea
            placeholder="Add a comment..."
            rows={3}
            style={{
              width: '100%',
              background: theme.colors.bg,
              border: `1px solid ${theme.colors.border}`,
              color: theme.colors.text,
              padding: '8px',
              borderRadius: isCarbon ? '2px' : '4px',
              fontSize: '11px',
              resize: 'none',
              outline: 'none',
              fontFamily: 'inherit',
              boxSizing: 'border-box',
            }}
          />
        )}

        {!currentUser && (
          <div style={{
            padding: '12px',
            background: theme.colors.bgSecondary,
            border: `1px dashed ${theme.colors.border}`,
            borderRadius: radius,
            fontSize: '11px',
            color: theme.colors.textMuted,
            textAlign: 'center',
          }}>
            Sign in to leave comments
          </div>
        )}
      </div>
    </div>
  );
}

function getUserAvatar(user: User): string {
  const initials = user.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  const colors = ['#4a9eff', '#f472b6', '#34d399', '#fbbf24', '#a78bfa'];
  const colorIndex = user.email.charCodeAt(0) % colors.length;
  return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" rx="8" fill="${colors[colorIndex]}"/><text x="50%" y="55%" dominant-baseline="middle" text-anchor="middle" font-family="sans-serif" font-size="16" font-weight="600" fill="white">${initials}</text></svg>`)}`;
}
