// Dev mode: use mock user ID as token (backend DevAuthAdapter accepts any string as userId)
// Set VITE_DEV_MODE=false at build time to disable (e.g., for e2e tests).
export const DEV_MODE = import.meta.env.VITE_DEV_MODE !== 'false';
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