/**
 * Google OAuth utility for DWO
 * Supports multiple OAuth flows:
 * 1. GSI TokenClient (preferred, when script is loaded)
 * 2. Popup OAuth with hash-based callback (browser / dev mode)
 * 3. Tauri shell opener (bundled desktop app — system browser)
 *
 * NOTE: there is intentionally NO Node `http` callback server here.
 * `await import('http')` breaks the browser bundle (Webpack cannot resolve
 * the Node builtin for `output:export` and Tauri has no Node runtime).
 */

import { loadGoogleScript } from './gsi';
import type { GoogleTokenResponse } from '@/types/google';

export interface OAuthProfile {
  email: string;
  name: string;
  picture: string;
}

export interface OAuthResult {
  profile: OAuthProfile;
  accessToken: string;
  expiresIn: number;
}

// ---------------------------------------------------------------------------
// Runtime detection
// ---------------------------------------------------------------------------

/** True when running inside the Tauri WebView (no popup / localhost listener). */
function isTauriRuntime(): boolean {
  try {
    return (
      typeof window !== 'undefined' &&
      (window.__TAURI__ !== undefined || window.__TAURI_INTERNALS__ !== undefined)
    );
  } catch {
    return false;
  }
}

/** Generate a random OAuth state parameter for CSRF protection. */
function generateState(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Build the Google OAuth URL (shared by popup + Tauri shell flows). */
function buildAuthUrl(clientId: string, state: string): URL {
  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', 'https://localhost');
  authUrl.searchParams.set('response_type', 'token');
  authUrl.searchParams.set('scope', 'email profile openid');
  authUrl.searchParams.set('prompt', 'select_account consent');
  authUrl.searchParams.set('state', state);
  return authUrl;
}

// ---------------------------------------------------------------------------
// Google OAuth with popup (browser / dev mode)
// ---------------------------------------------------------------------------

/**
 * Performs Google OAuth using a popup window.
 * Uses hash-fragment callback to avoid needing a backend server.
 * Only valid in a real browser — callers must guard Tauri via isTauriRuntime().
 */
export async function googleOAuthPopup(clientId: string): Promise<OAuthResult> {
  if (isTauriRuntime()) {
    return googleOAuthTauri(clientId);
  }

  return new Promise((resolve, reject) => {
    const popupWidth = 500;
    const popupHeight = 680;
    const left = Math.floor((screen.width - popupWidth) / 2);
    const top = Math.floor((screen.height - popupHeight) / 2);

    const state = generateState();
    const authUrl = buildAuthUrl(clientId, state);

    const popup = window.open(
      authUrl.toString(),
      'googleAuthPopup',
      `width=${popupWidth},height=${popupHeight},left=${left},top=${top},noopener,noreferrer`
    );

    if (!popup) {
      reject(new Error('Popup was blocked. Please allow popups for this application and try again.'));
      return;
    }

    // Listen for postMessage from the popup (sent after OAuth completes)
    const messageHandler = (event: MessageEvent) => {
      // Validate origin: only accept messages from same origin or local callback
      if (
        event.origin !== window.location.origin &&
        !event.origin.startsWith('http://localhost:') &&
        !event.origin.startsWith('http://127.0.0.1:') &&
        !event.origin.startsWith('https://localhost')
      ) {
        return;
      }

      if (event.data?.type === 'google_oauth_result') {
        cleanup();
        const params = event.data.params || event.data.payload;
        if (params instanceof URLSearchParams) {
          handleOAuthResponse(params).then(resolve, reject);
        } else if (typeof params === 'string') {
          handleOAuthResponse(new URLSearchParams(params)).then(resolve, reject);
        } else if (params && typeof params === 'object') {
          handleOAuthResponse(new URLSearchParams(params)).then(resolve, reject);
        } else {
          reject(new Error('Invalid OAuth response payload'));
        }
      } else if (event.data?.type === 'google_oauth_error') {
        cleanup();
        reject(new Error(event.data.payload?.error || 'Authentication failed'));
      }
    };

    const cleanup = () => {
      window.removeEventListener('message', messageHandler);
      clearInterval(pollInterval);
    };

    window.addEventListener('message', messageHandler);

    // Poll the popup to detect completion
    const pollInterval = setInterval(() => {
      if (popup.closed) {
        cleanup();
        // Result (if any) arrives via postMessage; closing without a
        // result means the user cancelled.
        reject(new Error('Sign-in window was closed before completing.'));
        return;
      }

      try {
        const currentUrl = popup.location?.href;
        if (currentUrl && currentUrl.startsWith('https://localhost')) {
          cleanup();
          // Extract hash params from the callback URL
          const hash = currentUrl.split('#')[1];
          if (hash) {
            const params = new URLSearchParams(hash);
            handleOAuthResponse(params).then(resolve, reject);
          } else {
            reject(new Error('No authentication response received'));
          }
        }
      } catch {
        // Cross-origin — expected while on accounts.google.com
      }
    }, 500);

    // Timeout after 5 minutes
    setTimeout(() => {
      cleanup();
      if (!popup.closed) popup.close();
      reject(new Error('Authentication timed out. Please try again.'));
    }, 5 * 60 * 1000);
  });
}

/**
 * Tauri desktop flow: open the system browser via the shell plugin and
 * reject with a clear message instead of hanging on a blocked popup.
 * Full deep-link return is wired up once a custom protocol is registered;
 * until then the user completes sign-in in the browser and pastes the token.
 */
export async function googleOAuthTauri(clientId: string): Promise<OAuthResult> {
  const state = generateState();
  const authUrl = buildAuthUrl(clientId, state);

  try {
    const { open } = await import('@tauri-apps/plugin-shell');
    await (open as (url: string) => Promise<void>)(authUrl.toString());
  } catch {
    // Shell plugin unavailable — fall through to the message below.
  }

  throw new Error(
    'Google sign-in opened in your system browser. ' +
      'Complete sign-in there, then paste the access token when prompted. ' +
      '(Automatic return to the app requires a registered dwo:// callback URL.)'
  );
}

/**
 * Handle the OAuth response from the popup/callback.
 */
async function handleOAuthResponse(params: URLSearchParams): Promise<OAuthResult> {
  const accessToken = params.get('access_token');
  const idToken = params.get('id_token');
  const expiresIn = parseInt(params.get('expires_in') || '3600', 10);
  const error = params.get('error');

  if (error) {
    throw new Error(`${error}: ${params.get('error_description') || ''}`);
  }

  if (!accessToken) {
    throw new Error('No access token in OAuth response');
  }

  // Parse ID token if available (it's a JWT)
  if (idToken) {
    try {
      const payload = JSON.parse(atob(idToken.split('.')[1]));
      return {
        profile: {
          email: payload.email || '',
          name: payload.name || payload.email?.split('@')[0] || 'User',
          picture: payload.picture || '',
        },
        accessToken,
        expiresIn,
      };
    } catch {
      // Fall through to userinfo endpoint
    }
  }

  // Fetch user info from Google's userinfo endpoint
  const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    throw new Error('Failed to fetch user profile from Google');
  }

  const profile = (await res.json()) as {
    email: string;
    name: string;
    picture: string;
    given_name?: string;
  };

  return {
    profile: {
      email: profile.email,
      name: profile.given_name || profile.name || profile.email?.split('@')[0] || 'User',
      picture: profile.picture || '',
    },
    accessToken,
    expiresIn,
  };
}

// ---------------------------------------------------------------------------
// GSI TokenClient flow (preferred when available)
// ---------------------------------------------------------------------------

export async function googleOAuthWithGSI(clientId: string): Promise<OAuthResult> {
  const gsi = window.google?.accounts?.oauth2;
  if (!gsi) {
    throw new Error('Google Identity Services not loaded');
  }

  return new Promise((resolve, reject) => {
    const client = gsi.initTokenClient({
      client_id: clientId,
      scope: 'email profile openid',
      callback: (response: GoogleTokenResponse) => {
        if (response.access_token) {
          const token = response.access_token;
          fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
            headers: { Authorization: `Bearer ${token}` },
          })
            .then((r) => r.json())
            .then((profile) => {
              resolve({
                profile: {
                  email: profile.email,
                  name: profile.name || profile.email?.split('@')[0] || 'User',
                  picture: profile.picture || '',
                },
                accessToken: token,
                expiresIn: response.expires_in || 3600,
              });
            })
            .catch(reject);
        } else if (response.error) {
          reject(new Error(response.error_description || response.error || 'Sign-in failed'));
        }
      },
    });

    client.requestAccessToken();
  });
}

// ---------------------------------------------------------------------------
// Main sign-in orchestrator
// ---------------------------------------------------------------------------

export async function signInWithGoogle(clientId: string): Promise<OAuthResult> {
  // Try GSI first if script is loaded (browser only; skipped in Tauri)
  if (!isTauriRuntime() && window.google?.accounts?.oauth2) {
    try {
      return await googleOAuthWithGSI(clientId);
    } catch (err) {
      console.warn('GSI TokenClient failed, falling back to popup:', err);
    }
  }

  // Popup flow routes to the Tauri shell flow automatically when needed
  return googleOAuthPopup(clientId);
}

// ---------------------------------------------------------------------------
// Client ID management
// ---------------------------------------------------------------------------

export function getGoogleClientId(): string | null {
  const envId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  if (envId) return envId;

  try {
    const stored = localStorage.getItem('dwo_google_client_id');
    if (stored) return stored;
  } catch {}

  return null;
}

export function saveGoogleClientId(clientId: string): void {
  try {
    localStorage.setItem('dwo_google_client_id', clientId);
  } catch {}
}

export function clearGoogleClientId(): void {
  try {
    localStorage.removeItem('dwo_google_client_id');
  } catch {}
}

export { loadGoogleScript };
