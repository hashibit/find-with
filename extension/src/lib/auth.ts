// Dev mode: true when Vite MODE is 'development' (pnpm dev / pnpm dev:web).
// Production builds (pnpm build) use MODE='production', so DEV_MODE is false.
// This controls runtime behavior (direct fetch vs chrome.runtime.sendMessage).
export const DEV_MODE = import.meta.env.MODE === 'development';

/**
 * Get auth token for API calls.
 * Token is written by website OAuth flow or background script bootstrap.
 * Sidepanel only reads from chrome.storage — no auth logic here.
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