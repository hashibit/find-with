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