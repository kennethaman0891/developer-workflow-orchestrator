/**
 * Google OAuth utility for DWO
 * Uses a popup window to perform the OAuth flow without requiring a backend server.
 *
 * To use with real Google OAuth:
 * 1. Create a project at https://console.cloud.google.com/
 * 2. Enable the Google+ API or OAuth 2.0 Playground
 * 3. Create OAuth 2.0 credentials (Desktop app type)
 * 4. Add your Client ID to .env.local as NEXT_PUBLIC_GOOGLE_CLIENT_ID
 * 5. Add the authorized redirect URI (see below)
 */

interface OAuthProfile {
  email: string;
  name: string;
  picture: string;
}

interface OAuthResult {
  profile: OAuthProfile;
  accessToken: string;
  expiresIn: number;
}

const REDIRECT_URI = 'https://localhost:3000/auth/google/callback';

/**
 * Opens a Google OAuth popup and returns the user profile.
 * Uses the standard OAuth 2.0 implicit grant flow with popup.
 */
export function googleOAuthPopup(clientId: string): Promise<OAuthResult> {
  return new Promise((resolve, reject) => {
    const popupWidth = 500;
    const popupHeight = 620;
    const left = Math.floor((screen.width - popupWidth) / 2);
    const top = Math.floor((screen.height - popupHeight) / 2);

    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
    authUrl.searchParams.set('response_type', 'token');
    authUrl.searchParams.set('scope', 'email profile openid');
    authUrl.searchParams.set('prompt', 'select_account consent');
    const state = Array.from(crypto.getRandomValues(new Uint8Array(16)))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    authUrl.searchParams.set('state', state);

    const popup = window.open(authUrl.toString(), 'googleAuthPopup', `width=${popupWidth},height=${popupHeight},left=${left},top=${top},noopener,noreferrer`);

    if (!popup) {
      reject(new Error('Popup was blocked. Please allow popups for this application.'));
      return;
    }

    // Listen for messages from the popup (sent via postMessage after OAuth completes)
    const messageHandler = (event: MessageEvent) => {
      if (event.data?.type === 'google_oauth_result') {
        window.removeEventListener('message', messageHandler);
        popup.close();
        resolve(event.data.payload);
      } else if (event.data?.type === 'google_oauth_error') {
        window.removeEventListener('message', messageHandler);
        if (!popup.closed) popup.close();
        reject(new Error(event.data.payload?.error || 'Authentication failed'));
      }
    };
    window.addEventListener('message', messageHandler);

    // Poll the popup to detect when it's closed or when we can read its URL
    const pollInterval = setInterval(() => {
      if (popup.closed) {
        clearInterval(pollInterval);
        window.removeEventListener('message', messageHandler);
        // Check if we got a result via postMessage already
        return;
      }

      try {
        const currentUrl = popup.location?.href;
        if (currentUrl && currentUrl.startsWith(REDIRECT_URI)) {
          clearInterval(pollInterval);
          window.removeEventListener('message', messageHandler);

          const hash = currentUrl.split('#')[1];
          if (!hash) {
            reject(new Error('No authentication response received'));
            return;
          }

          const params = new URLSearchParams(hash);
          const accessToken = params.get('access_token');
          const idToken = params.get('id_token');
          const expiresIn = parseInt(params.get('expires_in') || '3600', 10);

          if (!accessToken) {
            const error = params.get('error');
            reject(new Error(error ? `${error}: ${params.get('error_description')}` : 'No access token in response'));
            return;
          }

          // Parse ID token to get user info (it's a JWT)
          if (idToken) {
            try {
              const payload = JSON.parse(atob(idToken.split('.')[1]));
              resolve({
                profile: {
                  email: payload.email || '',
                  name: payload.name || payload.email?.split('@')[0] || 'User',
                  picture: payload.picture || '',
                },
                accessToken,
                expiresIn,
              });
              return;
            } catch {
              // Fall through to userinfo endpoint
            }
          }

          // Fetch user info from Google's userinfo endpoint
          fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
            headers: { Authorization: `Bearer ${accessToken}` },
          })
            .then(res => {
              if (!res.ok) throw new Error('Failed to fetch user info');
              return res.json() as Promise<{ email: string; name: string; picture: string }>;
            })
            .then(profile => {
              resolve({
                profile: {
                  email: profile.email,
                  name: profile.name || profile.email?.split('@')[0] || 'User',
                  picture: profile.picture || '',
                },
                accessToken,
                expiresIn,
              });
            })
            .catch(err => reject(err));
        }
      } catch {
        // Cross-origin error — expected while popup is on accounts.google.com
        // Just keep polling
      }
    }, 500);

    // Timeout after 5 minutes
    setTimeout(() => {
      clearInterval(pollInterval);
      window.removeEventListener('message', messageHandler);
      if (!popup.closed) popup.close();
      reject(new Error('Authentication timed out. Please try again.'));
    }, 5 * 60 * 1000);
  });
}

/**
 * Loads the Google Identity Services (GSI) script dynamically.
 * Returns true if loaded successfully, false otherwise.
 */
export function loadGoogleScript(): Promise<boolean> {
  return new Promise(resolve => {
    if ((window as any).google) {
      resolve(true);
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.head.appendChild(script);
  });
}

/**
 * Get the configured Google Client ID from environment or localStorage.
 */
export function getGoogleClientId(): string | null {
  // Check environment variable (set at build time)
  const envId = (process.env as any).NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  if (envId) return envId;

  // Check localStorage (set by user in settings)
  try {
    const stored = localStorage.getItem('dwo_google_client_id');
    if (stored) return stored;
  } catch {}

  return null;
}

/**
 * Save the Google Client ID to localStorage for persistence.
 */
export function saveGoogleClientId(clientId: string): void {
  try {
    localStorage.setItem('dwo_google_client_id', clientId);
  } catch {}
}

/**
 * Clear the saved Google Client ID.
 */
export function clearGoogleClientId(): void {
  try {
    localStorage.removeItem('dwo_google_client_id');
  } catch {}
}
