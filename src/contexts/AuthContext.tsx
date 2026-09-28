'use client';

import { createContext, useContext, useState, useCallback, useEffect, useRef, ReactNode } from 'react';

export interface User {
  id: string;
  email: string;
  name: string;
  avatar: string; // URL or initial-based placeholder
  role: 'owner' | 'editor' | 'viewer';
  joinedAt: string;
  password?: string;    // set for email/password-registered accounts
  isVerified: boolean;  // defaults true when hydrating legacy users
}

/** In-memory verification OTP (never persisted to localStorage). */
export interface VerificationState {
  email: string;
  code: string;        // 6-digit code
  expiresAt: number;   // ms timestamp
  attempts: number;
  /** Code just issued — surfaced in the UI until a real mail service exists. */
  freshCode: string | null;
}

interface AuthState {
  currentUser: User | null;
  collaborators: User[];
  isLoading: boolean;
  invitationCode: string | null;
  /** Account awaiting email verification after login or registration. */
  pendingUser: User | null;
  verification: VerificationState | null;
}

export type AuthResult = { ok: true } | { ok: false; error: string };

interface AuthContextType extends AuthState {
  signInWithGoogle: (profile: { email: string; name: string; picture: string }) => void;
  signInManually: (name: string, email: string) => void;
  signOut: () => void;
  generateInviteCode: () => void;
  acceptInvite: (code: string, profile: { email: string; name: string; picture: string }) => boolean;
  removeCollaborator: (userId: string) => void;
  kickCollaborator: (userId: string) => void;
  // Email/password + verification (stub: code held client-side until backend lands)
  registerUser: (name: string, email: string, password: string) => Promise<AuthResult>;
  signInWithEmail: (email: string, password: string) => Promise<AuthResult>;
  verifyEmail: (code: string) => Promise<AuthResult>;
  resendVerificationCode: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

// Demo accounts for testing without Google OAuth
const DEMO_USERS = [
  { email: 'kenneth@demo.dev', name: 'Kenneth Aman', picture: '' },
  { email: 'sarah@demo.dev', name: 'Sarah Chen', picture: '' },
  { email: 'mike@demo.dev', name: 'Mike Johnson', picture: '' },
];

const USERS_KEY = 'dwo_users';
const CODE_TTL_MS = 5 * 60 * 1000;   // verification codes live 5 minutes
const MAX_CODE_ATTEMPTS = 3;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function generateId() {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

function createInviteCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function generateOtp(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function normalizeUser(raw: Partial<User>): User {
  const base = raw as Partial<User>;
  return {
    ...base,
    id: base.id || generateId(),
    email: base.email || '',
    name: base.name || (base.email ? base.email.split('@')[0] : 'User'),
    avatar: base.avatar || '',
    role: base.role || 'owner',
    joinedAt: base.joinedAt || new Date().toISOString(),
    isVerified: base.isVerified ?? true, // legacy users count as verified
  };
}

/** Read password-registered accounts stored locally. */
function readStoredUsers(): User[] {
  try {
    const saved = localStorage.getItem(USERS_KEY);
    if (!saved) return [];
    const parsed = JSON.parse(saved);
    return Array.isArray(parsed) ? parsed.map(normalizeUser) : [];
  } catch {
    return [];
  }
}

function writeStoredUsers(users: User[]) {
  try {
    localStorage.setItem(USERS_KEY, JSON.stringify(users));
  } catch {}
}

function validatePassword(password: string): string | null {
  if (password.length < 8) return 'Password must be at least 8 characters';
  if (!/[a-zA-Z]/.test(password)) return 'Password must contain at least one letter';
  if (!/[0-9]/.test(password)) return 'Password must contain at least one number';
  return null;
}

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    currentUser: null,
    collaborators: [],
    isLoading: false,
    invitationCode: null,
    pendingUser: null,
    verification: null,
  });

  // Canonical (non-stale) copies of the in-flight verification flow.
  // React defers state updaters, so async validation must read refs.
  const pendingUserRef = useRef<User | null>(null);
  const verificationRef = useRef<VerificationState | null>(null);

  // Hydrate from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem('dwo_auth');
      if (saved) {
        const parsed = JSON.parse(saved) as { currentUser: Partial<User> | null; collaborators: Partial<User>[] };
        setState(prev => ({
          ...prev,
          currentUser: parsed.currentUser ? normalizeUser(parsed.currentUser) : null,
          collaborators: parsed.collaborators.map(normalizeUser),
        }));
      }
    } catch {
      // ignore corrupt data
    }
  }, []);

  const persist = useCallback((s: AuthState) => {
    localStorage.setItem('dwo_auth', JSON.stringify({
      currentUser: s.currentUser,
      collaborators: s.collaborators,
    }));
  }, []);

  const setVerification = useCallback((user: User | null, v: VerificationState | null) => {
    pendingUserRef.current = user;
    verificationRef.current = v;
    setState(prev => ({ ...prev, pendingUser: user, verification: v }));
  }, []);

  // Issue a fresh OTP for the given user (client-side stub until the
  // email-sending backend exists; the code is surfaced in the UI meanwhile).
  const issueCode = useCallback((user: User) => {
    const code = generateOtp();
    console.log('[DWO Auth] Verification code for', user.email, ':', code, '(stub — no mail service yet)');
    setVerification(user, {
      email: user.email,
      code,
      expiresAt: Date.now() + CODE_TTL_MS,
      attempts: 0,
      freshCode: code,
    });
  }, [setVerification]);

  const clearVerification = useCallback(() => {
    setVerification(null, null);
  }, [setVerification]);

  const signInWithGoogle = useCallback((profile: { email: string; name: string; picture: string }) => {
    const user = normalizeUser({
      email: profile.email,
      name: profile.name,
      avatar: profile.picture || '',
      role: 'owner',
      isVerified: true,
    });
    clearVerification();
    setState(prev => {
      const next = { ...prev, currentUser: user, collaborators: prev.collaborators.filter(c => c.email !== user.email) };
      persist(next);
      return next;
    });
  }, [persist, clearVerification]);

  const signInManually = useCallback((name: string, email: string) => {
    const existing = DEMO_USERS.find(u => u.email === email);
    const picture = existing?.picture || '';
    signInWithGoogle({ email, name: name || existing?.name || email.split('@')[0], picture });
  }, [signInWithGoogle]);

  const signOut = useCallback(() => {
    clearVerification();
    setState(prev => {
      const next = { ...prev, currentUser: null };
      persist(next);
      return next;
    });
  }, [persist, clearVerification]);

  const generateInviteCode = useCallback(() => {
    setState(prev => {
      const code = createInviteCode();
      return { ...prev, invitationCode: code };
    });
  }, []);

  const acceptInvite = useCallback((code: string, profile: { email: string; name: string; picture: string }) => {
    let storedCode: string | null = null;
    try {
      storedCode = localStorage.getItem('dwo_invite_code');
    } catch {}

    if (storedCode !== code.toUpperCase()) return false;

    const user = normalizeUser({
      email: profile.email,
      name: profile.name,
      avatar: profile.picture || '',
      role: 'editor',
      isVerified: true,
    });

    setState(prev => {
      if (prev.collaborators.find(c => c.email === user.email)) return prev;
      const next = { ...prev, collaborators: [...prev.collaborators, user] };
      persist(next);
      return next;
    });
    return true;
  }, [persist]);

  const removeCollaborator = useCallback((userId: string) => {
    setState(prev => {
      const next = { ...prev, collaborators: prev.collaborators.filter(c => c.id !== userId) };
      persist(next);
      return next;
    });
  }, [persist]);

  const kickCollaborator = useCallback((userId: string) => {
    setState(prev => {
      const next = { ...prev, collaborators: prev.collaborators.filter(c => c.id !== userId) };
      persist(next);
      return next;
    });
  }, [persist]);

  const registerUser = useCallback(async (name: string, email: string, password: string): Promise<AuthResult> => {
    const cleanName = name.trim();
    const cleanEmail = email.trim().toLowerCase();
    if (!EMAIL_RE.test(cleanEmail)) return { ok: false, error: 'Please enter a valid email address' };
    if (cleanName.length < 2) return { ok: false, error: 'Name must be at least 2 characters' };
    const pwError = validatePassword(password);
    if (pwError) return { ok: false, error: pwError };

    await delay(600); // simulate network round-trip

    const stored = readStoredUsers();
    const demoExists = DEMO_USERS.some(u => u.email.toLowerCase() === cleanEmail);
    if (stored.some(u => u.email.toLowerCase() === cleanEmail) || demoExists) {
      return { ok: false, error: 'An account with this email already exists' };
    }

    const user = normalizeUser({
      email: cleanEmail,
      name: cleanName,
      password,
      role: 'owner',
      isVerified: false,
    });
    writeStoredUsers([...stored, user]);
    issueCode(user);
    return { ok: true };
  }, [issueCode]);

  const signInWithEmail = useCallback(async (email: string, password: string): Promise<AuthResult> => {
    const cleanEmail = email.trim().toLowerCase();
    if (!EMAIL_RE.test(cleanEmail)) return { ok: false, error: 'Please enter a valid email address' };
    if (!password) return { ok: false, error: 'Please enter your password' };

    await delay(600); // simulate network round-trip

    const stored = readStoredUsers();
    const registered = stored.find(u => u.email.toLowerCase() === cleanEmail);
    const demo = !registered && DEMO_USERS.some(u => u.email.toLowerCase() === cleanEmail);

    if (!registered && !demo) {
      return { ok: false, error: 'No account found for this email' };
    }
    if (registered && registered.password !== password) {
      return { ok: false, error: 'Incorrect password' };
    }

    const user: User = registered
      ? registered
      : normalizeUser({ email: cleanEmail, name: cleanEmail.split('@')[0], isVerified: true });

    if (user.isVerified === false) {
      // Unverified account: issue the code, user confirms on the next step.
      issueCode(user);
      return { ok: false, error: 'unverified' };
    }

    clearVerification();
    setState(prev => {
      const next = { ...prev, currentUser: user, collaborators: prev.collaborators.filter(c => c.email !== user.email) };
      persist(next);
      return next;
    });
    return { ok: true };
  }, [persist, issueCode, clearVerification]);

  const verifyEmail = useCallback(async (code: string): Promise<AuthResult> => {
    const normalized = code.trim();
    await delay(400);

    const v = verificationRef.current;
    const user = pendingUserRef.current;

    if (!v || !user) {
      return { ok: false, error: 'No active verification — please sign in again.' };
    }
    if (Date.now() > v.expiresAt || v.attempts >= MAX_CODE_ATTEMPTS) {
      clearVerification();
      return { ok: false, error: 'This code has expired. Sign in again to request a new one.' };
    }
    if (!/^\d{6}$/.test(normalized)) {
      return { ok: false, error: 'Please enter the 6-digit code' };
    }
    if (v.code !== normalized) {
      const attempts = v.attempts + 1;
      setVerification(user, { ...v, attempts, freshCode: null });
      return { ok: false, error: 'That code does not match. Try again or request a new one.' };
    }

    // Success — activate the account and sign in.
    const verifiedUser = { ...user, isVerified: true };
    writeStoredUsers(readStoredUsers().map(u => (u.email === user.email ? verifiedUser : u)));
    setState(prev => {
      const next = {
        ...prev,
        currentUser: verifiedUser,
        collaborators: prev.collaborators.filter(c => c.email !== user.email),
        pendingUser: null,
        verification: null,
      };
      persist(next);
      return next;
    });
    pendingUserRef.current = null;
    verificationRef.current = null;
    return { ok: true };
  }, [persist, clearVerification, setVerification]);

  const resendVerificationCode = useCallback(async () => {
    await delay(400);
    if (pendingUserRef.current) {
      issueCode(pendingUserRef.current);
    }
  }, [issueCode]);

  return (
    <AuthContext.Provider value={{
      ...state,
      signInWithGoogle, signInManually, signOut, generateInviteCode, acceptInvite,
      removeCollaborator, kickCollaborator,
      registerUser, signInWithEmail, verifyEmail, resendVerificationCode,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
