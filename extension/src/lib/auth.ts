// Dev mode: true when Vite MODE is 'development' (pnpm dev / pnpm dev:web).
// Production builds (pnpm build) use MODE='production', so DEV_MODE is false automatically.
// In dev mode the background script bootstraps a real session token from mocks/clerk
// on startup — there's no "magic" token bypass in this file anymore.
export const DEV_MODE = import.meta.env.MODE === 'development';

// Mock-clerk URL for dev mode token bootstrap
const MOCK_CLERK_URL = 'http://localhost:14611';

// Cached token for dev mode (fetched once on first getToken call)
let devTokenCache: string | null = null;

/**
 * Get auth token for API calls.
 * - Production: reads from chrome.storage.local (set by website OAuth flow)
 * - Dev mode: bootstrap from mock-clerk and cache in memory
 */
export async function getToken(): Promise<string | null> {
  if (DEV_MODE) {
    if (devTokenCache) return devTokenCache;

    try {
      // 1. Get JWT from mock-clerk
      const signResp = await fetch(`${MOCK_CLERK_URL}/sign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sub: 'user_dev_001', email: 'dev@findwith.local' }),
      });
      const { token: jwt } = await signResp.json();

      // 2. Exchange JWT for session token at backend
      const verifyResp = await fetch('http://localhost:14607/api/v1/iam/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clerkToken: jwt }),
      });
      const { token: sessionToken } = await verifyResp.json();

      devTokenCache = sessionToken;
      return sessionToken;
    } catch (e) {
      console.error('[DEV AUTH] Failed to bootstrap token:', e);
      return null;
    }
  }

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
