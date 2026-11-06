// Secure Storage for DWO
//
// Encrypted localStorage wrapper using Web Crypto API (AES-GCM).
// Aligned with Rust backend ChaCha20-Poly1305 encryption.

import { bytesToHex, hexToBytes } from './crypto-utils';

const STORAGE_PREFIX = 'dwo_secure_';
const SALT_KEY = 'dwo_salt';
const IV_LENGTH = 12; // 96-bit IV for AES-GCM
const KEY_LENGTH = 256; // 256-bit key
const PBKDF2_ITERATIONS = 100000;

let derivedKey: CryptoKey | null = null;
let keyDerivationPromise: Promise<CryptoKey> | null = null;

/**
 * Get or create the master salt for key derivation.
 * Stored in localStorage (not secret, just unique per installation).
 */
async function getOrCreateSalt(): Promise<Uint8Array> {
  const stored = localStorage.getItem(SALT_KEY);
  if (stored) {
    return hexToBytes(stored);
  }
  const salt = crypto.getRandomValues(new Uint8Array(16));
  localStorage.setItem(SALT_KEY, bytesToHex(salt));
  return salt;
}

/**
 * Derive an encryption key from the user's password using PBKDF2.
 * The password is never stored - only the derived key is kept in memory.
 */
async function deriveKey(password: string): Promise<CryptoKey> {
  const salt = await getOrCreateSalt();
  
  const baseKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );
  
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as BufferSource,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-GCM', length: KEY_LENGTH },
    false, // not extractable
    ['encrypt', 'decrypt']
  );
}

/**
 * Initialize the secure storage with a user password.
 * Call this on app startup after user authentication.
 */
export async function initSecureStorage(password: string): Promise<void> {
  if (keyDerivationPromise) {
    derivedKey = await keyDerivationPromise;
    return;
  }
  
  keyDerivationPromise = deriveKey(password);
  derivedKey = await keyDerivationPromise;
}

/**
 * Check if secure storage is initialized (has a derived key).
 */
export function isSecureStorageInitialized(): boolean {
  return derivedKey !== null;
}

/**
 * Clear the secure storage (logout).
 */
export function clearSecureStorage(): void {
  derivedKey = null;
  keyDerivationPromise = null;
}

/**
 * Store an encrypted item.
 */
export async function setSecureItem<T>(key: string, value: T): Promise<void> {
  if (!derivedKey) {
    throw new Error('Secure storage not initialized. Call initSecureStorage first.');
  }
  
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const encoded = new TextEncoder().encode(JSON.stringify(value));
  
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    derivedKey,
    encoded
  );
  
  const combined = new Uint8Array(IV_LENGTH + encrypted.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(encrypted), IV_LENGTH);
  
  localStorage.setItem(STORAGE_PREFIX + key, bytesToHex(combined));
}

/**
 * Retrieve and decrypt an item.
 */
export async function getSecureItem<T>(key: string): Promise<T | null> {
  if (!derivedKey) {
    throw new Error('Secure storage not initialized. Call initSecureStorage first.');
  }
  
  const stored = localStorage.getItem(STORAGE_PREFIX + key);
  if (!stored) {
    return null;
  }
  
  try {
    const combined = hexToBytes(stored);
    const iv = combined.slice(0, IV_LENGTH);
    const encrypted = combined.slice(IV_LENGTH);
    
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      derivedKey,
      encrypted
    );
    
    const decoded = new TextDecoder().decode(decrypted);
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

/**
 * Remove a specific secure item.
 */
export function removeSecureItem(key: string): void {
  localStorage.removeItem(STORAGE_PREFIX + key);
}

/**
 * Clear all secure items (but keep salt).
 */
export function clearAllSecureItems(): void {
  const keys = Object.keys(localStorage).filter(k => k.startsWith(STORAGE_PREFIX));
  keys.forEach(k => localStorage.removeItem(k));
}

/**
 * Change the master password (re-encrypt all items).
 */
export async function changePassword(oldPassword: string, newPassword: string): Promise<void> {
  if (!derivedKey) {
    throw new Error('Secure storage not initialized.');
  }
  
  // Decrypt all items with old key
  const items: Record<string, unknown> = {};
  const keys = Object.keys(localStorage).filter(k => k.startsWith(STORAGE_PREFIX));
  
  for (const key of keys) {
    const name = key.slice(STORAGE_PREFIX.length);
    const value = await getSecureItem(name);
    if (value !== null) {
      items[name] = value;
    }
  }
  
  // Derive new key
  derivedKey = null;
  keyDerivationPromise = null;
  await initSecureStorage(newPassword);
  
  // Re-encrypt with new key
  for (const [name, value] of Object.entries(items)) {
    await setSecureItem(name, value);
  }
}

/**
 * Get the list of stored secure keys (metadata only, no decryption).
 */
export function listSecureKeys(): string[] {
  return Object.keys(localStorage)
    .filter(k => k.startsWith(STORAGE_PREFIX))
    .map(k => k.slice(STORAGE_PREFIX.length));
}
