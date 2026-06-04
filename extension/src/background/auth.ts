import { DEV_MODE } from '../lib/auth';
import { API_BASE } from './config.js';

// mocks/clerk URL — only used in DEV_MODE. Override via VITE_MOCK_CLERK_URL if your mock runs elsewhere.
const MOCK_CLERK_URL = (import.meta.env.VITE_MOCK_CLERK_URL as string | undefined) || 'http://localhost:14803';
const DEV_USER_SUB = 'dev_user_001';
const DEV_USER_EMAIL = 'dev@findwith.local';

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
 * Dev-only: bootstrap a real session token by signing a JWT via mocks/clerk,
 * then exchanging it for an extension session via POST /v1/iam/auth/verify.
 *
 * This puts dev on the exact same code path as prod auth — no magic token,
 * no guard bypass. The only difference is that JWKS is served locally.
 */
async function bootstrapDevSession(): Promise<void> {
  const existing = await chrome.storage.local.get(['token', 'expires_at']);
  if (existing.token && existing.expires_at && existing.expires_at > Date.now() / 1000 + 300) {
    console.log('[Auth] Dev session already valid');
    return;
  }

  try {
    const signResp = await fetch(`${MOCK_CLERK_URL}/sign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sub: DEV_USER_SUB, email: DEV_USER_EMAIL }),
    });
    if (!signResp.ok) throw new Error(`mock-clerk /sign HTTP ${signResp.status}`);
    const { token: clerkJwt } = await signResp.json();

    const verifyResp = await fetch(`${API_BASE}/v1/iam/auth/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clerkToken: clerkJwt }),
    });
    if (!verifyResp.ok) throw new Error(`backend /auth/verify HTTP ${verifyResp.status}`);
    const data = await verifyResp.json();

    await chrome.storage.local.set({
      token: data.token,
      expires_at: data.expires_at,
      user_id: data.user_id,
    });
    chrome.action.setBadgeText({ text: '' });
    console.log('[Auth] Dev session bootstrapped for', data.user_id);
  } catch (e) {
    console.error('[Auth] Dev session bootstrap failed', e);
    chrome.action.setBadgeText({ text: '!' });
    chrome.action.setBadgeBackgroundColor({ color: '#f59e0b' });
  }
}

export function initAuth() {
  if (DEV_MODE) {
    // Fire-and-forget — service worker keeps running while we bootstrap.
    void bootstrapDevSession();
    return;
  }

  // On startup, check if we have a valid token
  getToken().then((token) => {
    if (!token) {
      chrome.action.setBadgeText({ text: '!' });
      chrome.action.setBadgeBackgroundColor({ color: '#f59e0b' });
    }
  });
}
