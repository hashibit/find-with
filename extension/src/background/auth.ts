const API_BASE = 'http://localhost:14667'; // dev; prod: https://api.findwith.com

export async function getToken(): Promise<string | null> {
  const data = await chrome.storage.local.get(['token', 'expires_at']);
  if (!data.token) return null;

  // Check expiry (with 5min buffer for proactive refresh)
  if (data.expires_at && Date.now() / 1000 > data.expires_at - 300) {
    // Token expiring soon — request refresh from Side Panel
    // (SW can't refresh Clerk token directly; needs DOM context)
    chrome.action.setBadgeText({ text: '!' });
    chrome.action.setBadgeBackgroundColor({ color: '#f59e0b' });
    return data.token; // Return stale token, Side Panel will refresh on mount
  }

  return data.token;
}

export async function handleAuthToken(token: string): Promise<{ ok: boolean }> {
  try {
    // Parse the token to extract user_id and expires_at
    // Token format: ext_<userId>_<timestamp>
    const parts = token.split('_');
    if (parts.length < 3) {
      return { ok: false };
    }

    // Extract timestamp (last part) and calculate expiry
    const timestamp = parseInt(parts[parts.length - 1], 10);
    const userId = parts[1];
    const expiresAt = timestamp + 86400; // 24 hours

    if (isNaN(timestamp)) {
      return { ok: false };
    }

    // Store token and user info in chrome storage
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

export function initAuth() {
  // On startup, check if we have a valid token
  getToken().then((token) => {
    if (!token) {
      chrome.action.setBadgeText({ text: '!' });
      chrome.action.setBadgeBackgroundColor({ color: '#f59e0b' });
    }
  });
}
