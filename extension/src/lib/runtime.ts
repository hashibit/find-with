/**
 * Runtime seam: abstracts chrome.runtime.* so sidepanel can run in plain Vite dev server.
 *
 * DEV_MODE=true  → direct fetch / SSE (no chrome required)
 * DEV_MODE=false → chrome.runtime.sendMessage for content script messages, direct fetch/SSE for API calls
 */
import { DEV_MODE } from './auth';
import { API_V1 } from '../background/config';
import { bgMsgToRequest } from './api-routes';
import { openSseStream } from './sse';
import { getToken } from './auth';
import type { BgMsg } from '../background/bus';

// ─── runtimeCall ────────────────────────────────────────────────────────────

/**
 * For most API calls: direct fetch to backend.
 * For content script messages (JOB_CAPTURE, OPEN_SIDEPANEL): route through background.
 */
export async function runtimeCall(msg: BgMsg): Promise<any> {
  // Content script messages must go through background (chrome.sidePanel.open, etc.)
  if (!DEV_MODE && (msg.type === 'JOB_CAPTURE' || msg.type === 'EMAIL_CAPTURE' || msg.type === 'OPEN_SIDEPANEL')) {
    return chrome.runtime.sendMessage(msg);
  }

  const route = bgMsgToRequest(msg);
  if (!route) {
    console.warn('[runtime] No direct route for message type:', msg.type);
    return { error: `no_direct_route:${msg.type}` };
  }

  const token = await getToken();
  if (!token) return { error: 'not_authenticated' };

  try {
    const resp = await fetch(`${API_V1}/${route.path}`, {
      method: route.method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: route.body !== undefined ? JSON.stringify(route.body) : undefined,
    });
    if (!resp.ok) {
      const text = await resp.text();
      return { error: text || `${resp.status}` };
    }
    if (resp.status === 204) return {};
    return await resp.json();
  } catch (e) {
    return { error: String(e) };
  }
}

// ─── runtimeStream ──────────────────────────────────────────────────────────

export type StreamMessage =
  | { type: 'SSE_EVENT'; data: string }
  | { type: 'SSE_ERROR'; error: string };

/**
 * Direct SSE connection to backend (no background forwarding needed).
 * Sidepanel has full DOM API access, can use fetch + ReadableStream directly.
 */
export function runtimeStream(
  conversationId: string,
  message: string,
  onMessage: (msg: StreamMessage) => void,
  onDisconnect: () => void,
): () => void {
  let aborted = false;
  let ctrlRef: AbortController | null = null;

  getToken().then((token) => {
    if (aborted || !token) {
      if (!token) onMessage({ type: 'SSE_ERROR', error: 'not_authenticated' });
      return;
    }
    openSseStream(
      `${API_V1}/conversations/${conversationId}/prompt?message=${encodeURIComponent(message)}`,
      token,
      (event) => {
        if (!aborted) onMessage({ type: 'SSE_EVENT', data: event.data });
      },
      {
        onError: (err) => {
          if (!aborted) onMessage({ type: 'SSE_ERROR', error: err.message });
        },
      },
    ).then((ctrl) => {
      if (aborted) {
        ctrl.abort();
      } else {
        ctrlRef = ctrl;
      }
    }).catch((err) => {
      if (!aborted) onMessage({ type: 'SSE_ERROR', error: String(err) });
    });
  });

  return () => {
    aborted = true;
    ctrlRef?.abort();
    onDisconnect();
  };
}

// ─── runtimeNavBus ──────────────────────────────────────────────────────────

/**
 * Receives navigation commands from background (content script → background → sidepanel).
 * In dev mode: no-op (no background to push nav events).
 */
export function runtimeNavBus(onNavigate: (route: string) => void): () => void {
  if (!DEV_MODE) {
    const port = chrome.runtime.connect({ name: 'nav' });
    port.onMessage.addListener((msg: { type: string; route?: string }) => {
      if (msg.type === 'NAVIGATE' && msg.route) {
        onNavigate(msg.route);
      }
    });
    return () => { try { port.disconnect(); } catch {} };
  }

  // Dev: no background, nav bus is a no-op
  return () => {};
}