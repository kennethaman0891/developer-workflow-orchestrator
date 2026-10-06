/**
 * Google Identity Services (GSI) loader
 * Dynamically loads the GSI script from Google's CDN.
 */

export function isGoogleScriptLoaded(): boolean {
  return !!window.google?.accounts;
}

export function loadGoogleScript(): Promise<boolean> {
  return new Promise(resolve => {
    if (isGoogleScriptLoaded()) {
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
