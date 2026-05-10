/// <reference types="chrome" />
import { handleMessage, type BgMsg } from './bus';
import { initAuth, getToken, handleAuthNonce } from './auth';
import { openSseStream } from './sse';

// Open Side Panel on action click
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

// Message handler: content scripts → SW
chrome.runtime.onMessage.addListener((msg: BgMsg, sender, sendResponse) => {
  handleMessage(msg, sender).then(sendResponse);
  return true; // async
});

// External messages: website → SW (U-03 nonce flow)
chrome.runtime.onMessageExternal.addListener((msg, sender, sendResponse) => {
  // Origin check
  if (sender.origin !== 'https://findwith.com' && sender.origin !== 'http://localhost:14666') {
    return;
  }

  if (msg.type === 'AUTH_NONCE') {
    handleAuthNonce(msg.nonce).then(sendResponse);
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
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'sse-keepalive') {
    // Touch SSE connection or reconnect if needed
    console.log('[SW] keepalive tick');
  }
});

async function refreshEntitlements() {
  try {
    const token = await getToken();
    if (!token) return;
    const resp = await fetch('https://api.findwith.com/v1/me/entitlements', {
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

// Port connections (SW ↔ Side Panel)
const connectedPorts: Set<chrome.runtime.Port> = new Set();

chrome.runtime.onConnect.addListener((port) => {
  connectedPorts.add(port);
  port.onDisconnect.addListener(() => connectedPorts.delete(port));

  port.onMessage.addListener(async (msg) => {
    if (msg.type === 'REQ_REFRESH_TOKEN') {
      // Side Panel has refreshed token via Clerk
      if (msg.token) {
        await chrome.storage.local.set({ token: msg.token, expires_at: msg.expires_at });
      }
    }
  });
});

console.log('[FindWith SW] initialized');
