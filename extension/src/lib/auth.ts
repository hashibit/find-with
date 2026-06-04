// Dev mode: true when Vite MODE is 'development' (pnpm dev / pnpm dev:web).
// Production builds (pnpm build) use MODE='production', so DEV_MODE is false automatically.
// In dev mode the background script bootstraps a real session token from mocks/clerk
// on startup — there's no "magic" token bypass in this file anymore.
export const DEV_MODE = import.meta.env.MODE === 'development';

/**
 * Get auth token for API calls. Reads the session token stored in chrome.storage
 * by either the website OAuth flow (prod) or the dev bootstrap (dev mode).
 */
export async function getToken(): Promise<string | null> {
  return new Promise((resolve) => {
    chrome.storage.local.get(['token'], (res) => resolve(res['token'] ?? null));
  });
}

/**
 * Get Authorization header for fetch calls.
 */
export async function getAuthHeaders(): Promise<Record<string, string>> {
  const token = await getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}
