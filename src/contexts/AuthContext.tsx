'use client';

import { createContext, useContext, useState, useCallback, useEffect, useRef, ReactNode } from 'react';

export interface User {
  id: string;
  email: string;
  name: string;
  avatar: string; // URL or initial-based placeholder
  role: 'owner' | 'editor' | 'viewer';
  joinedAt: string;
  /** Salted-hash credential `saltHex:sha256Hex` for email/password accounts.
   * Only the *stored* (dwo_users) copy carries it; session state and
   * `dwo_auth` never persist it. Legacy plaintext is migrated on sign-in. */
  password?: string;
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

// ---------------------------------------------------------------------------
// CSPRNG + password hashing
//
// All secrets in this module (ids, invite codes, OTPs, password salts) come
// from the Web Crypto CSPRNG — `Math.random` is not cryptographically secure
// and is only kept as a last-resort fallback for non-secure contexts where
// even `getRandomValues` is unavailable (rare; it exists on http:// too).
// ---------------------------------------------------------------------------

function secureRandomBytes(count: number): Uint8Array {
  const out = new Uint8Array(count);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(out);
  } else {
    for (let i = 0; i < count; i++) out[i] = Math.floor(Math.random() * 256);
  }
  return out;
}

function bytesToHex(bytes: Uint8Array): string {
  let out = '';
  for (const b of bytes) out += b.toString(16).padStart(2, '0');
  return out;
}

function randomHex(byteLength: number): string {
  return bytesToHex(secureRandomBytes(byteLength));
}

const BASE36 = '0123456789abcdefghijklmnopqrstuvwxyz';

function randomBase36(length: number): string {
  const out = new Array<string>(length);
  let i = 0;
  while (i < length) {
    const byte = secureRandomBytes(1)[0];
    if (byte < 216) out[i++] = BASE36[byte % 36]; // rejection sample: no mod bias
  }
  return out.join('');
}

/** Uniform int in [0, modulus) via rejection sampling. */
function randomIntBelow(modulus: number): number {
  const limit = 256 - (256 % modulus);
  let byte = 0;
  do {
    byte = secureRandomBytes(1)[0];
  } while (byte >= limit);
  return byte % modulus;
}

function generateId() {
  return randomBase36(10) + Date.now().toString(36);
}

function createInviteCode() {
  return randomBase36(6).toUpperCase();
}

function generateOtp(): string {
  return String(100000 + randomIntBelow(900000));
}

/** Constant-time compare for hex/hash material (length must match). */
function safeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const SALT_BYTES = 8;

/**
 * Stored password format: `<8-byte salt hex>:<sha256(salt:password) hex>`.
 */
const STORED_PASSWORD_RE = new RegExp(
  `^[0-9a-f]{${SALT_BYTES * 2}}:[0-9a-f]{64}$`,
);

function isStoredPassword(value: unknown): boolean {
  // Plain boolean (not a type predicate): callers pass `string` values, and a
  // `value is string` guard would narrow the false branch of `string` inputs
  // to `never` (e.g. in verifyStoredPassword's legacy-plaintext path).
  return typeof value === 'string' && STORED_PASSWORD_RE.test(value);
}

/**
 * Pure-JS SHA-256 — used only when `crypto.subtle` is unavailable
 * (non-secure browser contexts; Tauri's WebView is always secure).
 * Standard FIPS 180-4 algorithm. Verified against known vectors (see
 * `scripts/sha256-fallback.test.mjs`).
 */
function sha256FallbackHex(data: Uint8Array): string {
  const K = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ]);
  const H = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);

  // Pad to 64-byte blocks: data + 0x80 + zeros + 64-bit big-endian bit length.
  const totalLenBits = data.length * 8;
  const blocks = Math.ceil((data.length + 9) / 64);
  const padded = new Uint8Array(blocks * 64);
  padded.set(data);
  padded[data.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 8, Math.floor(totalLenBits / 0x100000000));
  view.setUint32(padded.length - 4, totalLenBits >>> 0);

  const w = new Uint32Array(64);
  const rot = (x: number, n: number) => (x >>> n) | (x << (32 - n));

  for (let block = 0; block < blocks; block++) {
    const off = block * 64;
    for (let t = 0; t < 16; t++) w[t] = view.getUint32(off + t * 4);
    for (let t = 16; t < 64; t++) {
      const s0 = rot(w[t - 15], 7) ^ rot(w[t - 15], 18) ^ (w[t - 15] >>> 3);
      const s1 = rot(w[t - 2], 17) ^ rot(w[t - 2], 19) ^ (w[t - 2] >>> 10);
      w[t] = (w[t - 16] + s0 + w[t - 7] + s1) | 0;
    }

    let a = H[0], b = H[1], c = H[2], d = H[3];
    let e = H[4], f = H[5], g = H[6], h = H[7];

    for (let t = 0; t < 64; t++) {
      const S1 = rot(e, 6) ^ rot(e, 11) ^ rot(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + K[t] + w[t]) | 0;
      const S0 = rot(a, 2) ^ rot(a, 13) ^ rot(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) | 0;
      h = g; g = f; f = e; e = (d + temp1) | 0;
      d = c; c = b; b = a; a = (temp1 + temp2) | 0;
    }

    H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0;
    H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
  }

  let out = '';
  for (const word of H) out += (word >>> 0).toString(16).padStart(8, '0');
  return out;
}

/** SHA-256 via WebCrypto when available, pure-JS fallback otherwise. */
async function digestSha256Hex(data: Uint8Array<ArrayBuffer>): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    try {
      const digest = await crypto.subtle.digest('SHA-256', data);
      return bytesToHex(new Uint8Array(digest));
    } catch {
      // subtle unavailable at runtime (e.g. revoked context) — fall through
    }
  }
  return sha256FallbackHex(data);
}

/** Hash a password into its stored `salt:hash` form (fresh random salt). */
async function hashPassword(password: string, saltHex?: string): Promise<string> {
  const salt = saltHex ?? randomHex(SALT_BYTES);
  const hash = await digestSha256Hex(new TextEncoder().encode(`${salt}:${password}`));
  return `${salt}:${hash}`;
}

/**
 * Verify input against a stored credential. Accepts the `salt:hash` form
 * and, during the one-time migration window, legacy plaintext.
 */
async function verifyStoredPassword(stored: string, input: string): Promise<boolean> {
  if (isStoredPassword(stored)) {
    const salt = stored.slice(0, 16); // STORED_PASSWORD_RE guarantees 16 hex chars
    const candidate = await hashPassword(input, salt);
    return safeEqualHex(candidate, stored);
  }
  // Legacy plaintext (pre-migration) — constant-time-ish compare.
  if (stored.length !== input.length) return false;
  let diff = 0;
  for (let i = 0; i < stored.length; i++) diff |= stored.charCodeAt(i) ^ input.charCodeAt(i);
  return diff === 0;
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
    const users = Array.isArray(parsed) ? parsed.map(normalizeUser) : [];
    // One-time migration: re-hash legacy plaintext credentials off the hot path.
    if (users.some(u => u.password !== undefined && !isStoredPassword(u.password))) {
      void migrateStoredUsers(users);
    }
    return users;
  } catch {
    return [];
  }
}

let migratingStoredUsers = false;

/** Re-hash any legacy plaintext passwords in `dwo_users` (idempotent). */
async function migrateStoredUsers(users: User[]): Promise<void> {
  if (migratingStoredUsers) return;
  migratingStoredUsers = true;
  try {
    const migrated = await Promise.all(
      users.map(async u =>
        u.password !== undefined && !isStoredPassword(u.password)
          ? { ...u, password: await hashPassword(u.password) }
          : u,
      ),
    );
    const current = readStoredUsers();
    if (current.some(u => u.password !== undefined && !isStoredPassword(u.password))) {
      writeStoredUsers(migrated);
    }
  } catch {
    // best effort — never block the caller
  } finally {
    migratingStoredUsers = false;
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
    // `dwo_auth` is the *session* store — never carry credentials into it.
    // Password material lives only in `dwo_users`, hashed.
    const withoutPassword = (u: User | null) => (u ? { ...u, password: undefined } : u);
    localStorage.setItem('dwo_auth', JSON.stringify({
      currentUser: withoutPassword(s.currentUser),
      collaborators: s.collaborators.map(withoutPassword),
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
      password: await hashPassword(password),
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
    if (
      registered &&
      registered.password !== undefined &&
      !(await verifyStoredPassword(registered.password, password))
    ) {
      return { ok: false, error: 'Incorrect password' };
    }

    const user: User = registered
      ? registered
      : normalizeUser({ email: cleanEmail, name: cleanEmail.split('@')[0], isVerified: true });

    // Successful sign-in on a legacy plaintext credential: upgrade it in place.
    if (
      registered &&
      registered.password !== undefined &&
      !isStoredPassword(registered.password)
    ) {
      const hashed = await hashPassword(password);
      writeStoredUsers(
        readStoredUsers().map(u => (u.email === cleanEmail ? { ...u, password: hashed } : u)),
      );
      user.password = hashed;
    }

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
