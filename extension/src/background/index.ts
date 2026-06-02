/// <reference types="chrome" />
import { handleMessage, type BgMsg } from './bus';
import { initAuth, getToken, handleAuthNonce, handleAuthToken } from './auth';
import { openSseStream } from './sse';

// Open Side Panel on action click
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

// Port connections (SW ↔ Side Panel) — declared early so handlers below can reference it
const connectedPorts: Set<chrome.runtime.Port> = new Set();
const conversationPorts: Map<string, chrome.runtime.Port> = new Map(); // conversationId → port

chrome.runtime.onConnect.addListener((port) => {
  connectedPorts.add(port);
  port.onDisconnect.addListener(() => {
    connectedPorts.delete(port);
    // Clean up conversation port if it was one
    for (const [convId, p] of conversationPorts.entries()) {
      if (p === port) {
        conversationPorts.delete(convId);
        break;
      }
    }
  });

  port.onMessage.addListener(async (msg) => {
    if (msg.type === 'REQ_REFRESH_TOKEN') {
      // Side Panel has refreshed token via Clerk
      if (msg.token) {
        await chrome.storage.local.set({ token: msg.token, expires_at: msg.expires_at });
      }
    }

    // Conversation SSE streaming
    if (msg.type === 'CONVERSATION_PROMPT') {
      const { conversationId, message } = msg.payload;
      const token = await getToken();
      if (!token) {
        port.postMessage({ type: 'SSE_ERROR', error: 'not_authenticated' });
        return;
      }

      // Register this port for the conversation
      conversationPorts.set(conversationId, port);

      // Open SSE stream and forward events
      try {
        const ctrl = await openSseStream(
          `http://localhost:14667/api/v1/conversations/${conversationId}/prompt?message=${encodeURIComponent(message)}`,
          token,
          (event) => {
            port.postMessage({ type: 'SSE_EVENT', data: event.data });
          },
        );

        // Store abort controller for cleanup
        port.onDisconnect.addListener(() => {
          ctrl.abort();
          conversationPorts.delete(conversationId);
        });
      } catch (e) {
        port.postMessage({ type: 'SSE_ERROR', error: String(e) });
      }
    }
  });
});

// Message handler: content scripts → SW
chrome.runtime.onMessage.addListener((msg: BgMsg, sender, sendResponse) => {
  handleMessage(msg, sender, connectedPorts).then(sendResponse);
  return true; // async
});

// External messages: website → SW (U-03 auth flow)
chrome.runtime.onMessageExternal.addListener((msg, sender, sendResponse) => {
  // Origin check
  if (sender.origin !== 'https://findwith.com' && sender.origin !== 'http://localhost:14666') {
    return;
  }

  if (msg.type === 'AUTH_NONCE') {
    handleAuthNonce(msg.nonce).then(sendResponse);
    return true;
  }

  if (msg.type === 'AUTH_TOKEN') {
    // expires_at and user_id come from the API response relayed by the website.
    // The token string itself is opaque (CSPRNG) and carries no parseable fields.
    handleAuthToken(msg.token, msg.expires_at, msg.user_id).then(sendResponse);
    return true;
  }

  if (msg.type === 'ENTITLEMENTS_INVALIDATE') {
    // Trigger immediate entitlements refresh
    refreshEntitlements().then(sendResponse);
    return true;
  }
});

// Alarms for SSE keepalive (MV3 SW 30s kill workaround)
chrome.alarms.create('sse-keepalive', { periodInMinutes: 0.4 }); // ~25s
// Periodic entitlements refresh — ensures quota/tier stays fresh without a push (U-09)
chrome.alarms.create('entitlements-refresh', { periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'sse-keepalive') {
    // Touch SSE connection or reconnect if needed
    console.log('[SW] keepalive tick');
  }
  if (alarm.name === 'entitlements-refresh') {
    void refreshEntitlements();
  }
});

async function refreshEntitlements() {
  try {
    const token = await getToken();
    if (!token) return;
    const resp = await fetch('http://localhost:14667/api/v1/iam/me/entitlements', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (resp.ok) {
      const data = await resp.json();
      await chrome.storage.local.set({ entitlements: data });
      // Notify Side Panel
      const ports = connectedPorts;
      ports.forEach((port) => port.postMessage({ type: 'ENTITLEMENTS_UPDATED', data }));
    }
  } catch (e) {
    console.error('[SW] entitlements refresh failed', e);
  }
}

console.log('[FindWith SW] initialized');