/**
 * Google OAuth utility for DWO
 * Supports multiple OAuth flows:
 * 1. GSI TokenClient (preferred, when script is loaded)
 * 2. Popup OAuth with hash-based callback
 * 3. Local HTTP server callback (for production)
 */

import { loadGoogleScript } from './gsi';

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
// Local callback server
// ---------------------------------------------------------------------------

/**
 * Starts a tiny local HTTP server to receive the OAuth callback.
 * Returns the port it's listening on, or null if it fails.
 */
async function startCallbackServer(): Promise<number | null> {
  try {
    // Use a free port by binding to 0
    const http = await import('http');
    const server = http.createServer((req, res) => {
      if (req.url?.startsWith('/callback')) {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`
          <html><body>
            <script>
              // Send the OAuth data back to the main window
              if (window.opener) {
                window.opener.postMessage({ type: 'google_oauth_result', payload: new URLSearchParams(window.location.hash.slice(1)) }, '*');
              }
              window.close();
            </script>
            <p>Authentication successful! You can close this window.</p>
          </body></html>
        `);
      } else {
        res.writeHead(404);
        res.end('Not found');
      }
    });

    await new Promise<void>((resolve, reject) => {
      server.listen(0, '127.0.0.1', () => resolve());
      server.on('error', reject);
    });

    const address = server.address() as any;
    return address?.port ?? null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Google OAuth with popup
// ---------------------------------------------------------------------------

/**
 * Performs Google OAuth using a popup window.
 * Uses hash-fragment callback to avoid needing a backend server.
 */
export async function googleOAuthPopup(clientId: string): Promise<OAuthResult> {
  return new Promise((resolve, reject) => {
    const popupWidth = 500;
    const popupHeight = 680;
    const left = Math.floor((screen.width - popupWidth) / 2);
    const top = Math.floor((screen.height - popupHeight) / 2);

    // Generate a random state parameter for CSRF protection
    const state = Array.from(crypto.getRandomValues(new Uint8Array(16)))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    // Build the OAuth URL with prompt=select_account to force account chooser
    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('redirect_uri', 'https://localhost');
    authUrl.searchParams.set('response_type', 'token');
    authUrl.searchParams.set('scope', 'email profile openid');
    authUrl.searchParams.set('prompt', 'select_account consent');
    authUrl.searchParams.set('state', state);

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
          handleOAuthResponse(params);
        } else if (typeof params === 'string') {
          handleOAuthResponse(new URLSearchParams(params));
        } else if (params && typeof params === 'object') {
          handleOAuthResponse(new URLSearchParams(params));
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
        // Check if we got the result via postMessage
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
            handleOAuthResponse(params);
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

  const profile = await res.json() as { email: string; name: string; picture: string; given_name?: string };

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
  const gsi = (window as any).google?.accounts?.oauth2;
  if (!gsi) {
    throw new Error('Google Identity Services not loaded');
  }

  return new Promise((resolve, reject) => {
    const client = gsi.initTokenClient({
      client_id: clientId,
      scope: 'email profile openid',
      callback: (response: any) => {
        if (response.access_token) {
          fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
            headers: { Authorization: `Bearer ${response.access_token}` },
          })
            .then(r => r.json())
            .then(profile => {
              resolve({
                profile: {
                  email: profile.email,
                  name: profile.name || profile.email?.split('@')[0] || 'User',
                  picture: profile.picture || '',
                },
                accessToken: response.access_token,
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
  // Try GSI first if script is loaded
  if ((window as any).google?.accounts?.oauth2) {
    try {
      return await googleOAuthWithGSI(clientId);
    } catch (err) {
      console.warn('GSI TokenClient failed, falling back to popup:', err);
    }
  }

  // Fallback to popup flow
  return googleOAuthPopup(clientId);
}

// ---------------------------------------------------------------------------
// Client ID management
// ---------------------------------------------------------------------------

export function getGoogleClientId(): string | null {
  const envId = (process.env as any).NEXT_PUBLIC_GOOGLE_CLIENT_ID;
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
