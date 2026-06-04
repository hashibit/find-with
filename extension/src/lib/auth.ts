// Dev mode: true when Vite MODE is 'development' (pnpm dev / pnpm dev:web).
// Production builds (pnpm build) use MODE='production', so DEV_MODE is false automatically.
export const DEV_MODE = import.meta.env.MODE === 'development';
export const DEV_USER_ID = 'dev_user_001';

/**
 * Get auth token for API calls.
 * In dev mode, returns mock userId.
 * In prod, reads from chrome.storage.
 */
export async function getToken(): Promise<string | null> {
  if (DEV_MODE) {
    return DEV_USER_ID;
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