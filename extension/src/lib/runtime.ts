/**
 * Runtime seam: abstracts chrome.runtime.* so sidepanel can run in plain Vite dev server.
 *
 * DEV_MODE=true  → direct fetch / SSE (no chrome required)
 * DEV_MODE=false → chrome.runtime.sendMessage / connect (production extension)
 */
import { DEV_MODE } from './auth';
import { API_V1 } from '../background/config';
import { bgMsgToRequest } from './api-routes';
import { openSseStream } from './sse';
import { getToken } from './auth';
import type { BgMsg } from '../background/bus';

// ─── runtimeCall ────────────────────────────────────────────────────────────

/**
 * Replaces chrome.runtime.sendMessage for sidepanel stores.
 * Returns the same response shape as the background message handler.
 */
export async function runtimeCall(msg: BgMsg): Promise<any> {
  if (!DEV_MODE) {
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
 * Replaces chrome.runtime.connect('conversation') for SSE streaming.
 * Returns an abort/cleanup function.
 */
export function runtimeStream(
  conversationId: string,
  message: string,
  onMessage: (msg: StreamMessage) => void,
  onDisconnect: () => void,
): () => void {
  if (!DEV_MODE) {
    const port = chrome.runtime.connect({ name: 'conversation' });
    port.postMessage({ type: 'CONVERSATION_PROMPT', payload: { conversationId, message } });
    port.onMessage.addListener((msg: StreamMessage) => onMessage(msg));
    port.onDisconnect.addListener(() => onDisconnect());
    return () => { try { port.disconnect(); } catch {} };
  }

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
        // persistEventId omitted — no SSE resume in dev mode
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
 * Replaces chrome.runtime.connect('nav') for background-pushed navigation.
 * In dev mode: no-op (no background to push nav events).
 * Returns a cleanup function.
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
