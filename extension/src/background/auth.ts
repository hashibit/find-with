import { API_BASE } from './config.js';

export async function getToken(): Promise<string | null> {
  const data = await chrome.storage.local.get(['token', 'expires_at']);
  if (!data.token) return null;

  // Check expiry (with 5min buffer for proactive refresh).
  // expires_at is stored in Unix seconds; Date.now() / 1000 converts to the same unit.
  if (data.expires_at && Date.now() / 1000 > data.expires_at - 300) {
    // Token expiring soon — request refresh from Side Panel
    // (SW can't refresh Clerk token directly; needs DOM context)
    chrome.action.setBadgeText({ text: '!' });
    chrome.action.setBadgeBackgroundColor({ color: '#f59e0b' });
    return data.token; // Return stale token, Side Panel will refresh on mount
  }

  return data.token;
}

/**
 * Store an extension session token received from the website.
 * The caller (website) is responsible for providing expires_at (Unix seconds)
 * and user_id from the API response — do NOT re-derive these from the token string.
 */
export async function handleAuthToken(
  token: string,
  expiresAt: number,
  userId: string,
): Promise<{ ok: boolean }> {
  try {
    await chrome.storage.local.set({
      token,
      expires_at: expiresAt,
      user_id: userId,
    });

    chrome.action.setBadgeText({ text: '' });
    return { ok: true };
  } catch (e) {
    console.error('[Auth] token handler failed', e);
    return { ok: false };
  }
}

export async function handleAuthNonce(nonce: string): Promise<{ ok: boolean }> {
  try {
    const resp = await fetch(`${API_BASE}/v1/iam/auth/exchange`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nonce }),
    });

    if (!resp.ok) return { ok: false };

    const data = await resp.json();
    await chrome.storage.local.set({
      token: data.token,
      expires_at: data.expires_at,
      user_id: data.user_id,
    });

    chrome.action.setBadgeText({ text: '' });
    return { ok: true };
  } catch (e) {
    console.error('[Auth] nonce exchange failed', e);
    return { ok: false };
  }
}

/**
 * On startup, check if we have a valid token.
 * Auth is always done by website — extension only reads chrome.storage.
 */
export function initAuth() {
  getToken().then((token) => {
    if (!token) {
      chrome.action.setBadgeText({ text: '!' });
      chrome.action.setBadgeBackgroundColor({ color: '#f59e0b' });
    }
  });
}