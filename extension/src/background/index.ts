/// <reference types="chrome" />
import { handleMessage, type BgMsg } from './bus';
import { initAuth, handleAuthNonce, handleAuthToken, handleEntitlementsInvalidate } from './auth';

// Bootstrap auth on service worker startup
initAuth();

// Open Side Panel on action click
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

// Port connections for nav bus (content script → background → sidepanel)
const navPorts: Set<chrome.runtime.Port> = new Set();

chrome.runtime.onConnect.addListener((port) => {
  if (port.name === 'nav') {
    navPorts.add(port);
    port.onDisconnect.addListener(() => navPorts.delete(port));
  }
});

// Message handler: content scripts → SW
chrome.runtime.onMessage.addListener((msg: BgMsg, sender, sendResponse) => {
  handleMessage(msg, sender, navPorts).then(sendResponse);
  return true; // async
});

// External messages: website → SW (auth flow)
chrome.runtime.onMessageExternal.addListener((msg, sender, sendResponse) => {
  // Origin check
  if (sender.origin !== 'https://findwith.com' && sender.origin !== 'http://localhost:14606') {
    return;
  }

  if (msg.type === 'AUTH_NONCE') {
    handleAuthNonce(msg.nonce).then(sendResponse);
    return true;
  }

  if (msg.type === 'AUTH_TOKEN') {
    handleAuthToken(msg.token, msg.expires_at, msg.user_id).then((result) => {
      if (result.ok) {
        navPorts.forEach((p) => p.postMessage({ type: 'AUTH_SUCCESS' }));
      }
      sendResponse(result);
    });
    return true;
  }

  if (msg.type === 'ENTITLEMENTS_INVALIDATE') {
    handleEntitlementsInvalidate(navPorts).then(() => sendResponse({ ok: true }));
    return true;
  }
});

console.log('[FindWith SW] initialized');