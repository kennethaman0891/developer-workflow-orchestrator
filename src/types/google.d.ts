/**
 * Runtime type declarations for the Google Identity Services (GSI) global.
 *
 * The GSI script (https://accounts.google.com/gsi/client) attaches
 * `google.accounts.oauth2` to `window` at runtime when loaded. No @types
 * package covers it, so we declare the minimal shape the app actually uses.
 */

export interface GoogleTokenResponse {
  /** Bearer token for the requested scopes. */
  access_token?: string;
  /** Token lifetime in seconds. */
  expires_in?: number;
  /** Populated when the token request fails. */
  error?: string;
  error_description?: string;
}

export interface GoogleTokenClientConfig {
  client_id: string;
  scope: string;
  callback: (response: GoogleTokenResponse) => void;
}

export interface GoogleTokenClient {
  requestAccessToken: (forcePrompt?: boolean) => void;
}

export interface GoogleAccountsAPI {
  accounts?: {
    oauth2?: {
      initTokenClient: (config: GoogleTokenClientConfig) => GoogleTokenClient;
    };
  };
}

declare global {
  interface Window {
    /** Populated at runtime by the GSI script when it is loaded. */
    google?: GoogleAccountsAPI;
  }
}

export {};
