/**
 * Chrome Extension API stubs for Vitest unit tests.
 *
 * Usage in vitest.config.ts:
 *   setupFiles: ['../mocks/chrome/index.js']
 *
 * Or import directly in test files:
 *   import '../../../mocks/chrome/index.js'
 *
 * Covers the chrome.* APIs used by this extension:
 *   chrome.storage.local
 *   chrome.runtime (sendMessage, onMessage, getURL, id)
 *   chrome.tabs
 *   chrome.action (badge, popup)
 *   chrome.sidePanel
 */

import { vi } from 'vitest';

const storage = {};

global.chrome = {
  storage: {
    local: {
      get: vi.fn((keys, callback) => {
        const result = {};
        const keyList = typeof keys === 'string' ? [keys] : Array.isArray(keys) ? keys : Object.keys(keys);
        for (const k of keyList) result[k] = storage[k];
        if (callback) callback(result);
        return Promise.resolve(result);
      }),
      set: vi.fn((items, callback) => {
        Object.assign(storage, items);
        if (callback) callback();
        return Promise.resolve();
      }),
      remove: vi.fn((keys, callback) => {
        const keyList = typeof keys === 'string' ? [keys] : keys;
        for (const k of keyList) delete storage[k];
        if (callback) callback();
        return Promise.resolve();
      }),
      clear: vi.fn((callback) => {
        for (const k of Object.keys(storage)) delete storage[k];
        if (callback) callback();
        return Promise.resolve();
      }),
    },
    onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
  },

  runtime: {
    id: 'mock-extension-id',
    sendMessage: vi.fn(),
    onMessage: { addListener: vi.fn(), removeListener: vi.fn(), hasListener: vi.fn() },
    onConnect: { addListener: vi.fn(), removeListener: vi.fn() },
    getURL: vi.fn((path) => `chrome-extension://mock-extension-id/${path}`),
    lastError: null,
  },

  tabs: {
    query: vi.fn(() => Promise.resolve([])),
    sendMessage: vi.fn(() => Promise.resolve()),
    create: vi.fn(() => Promise.resolve({ id: 1 })),
    update: vi.fn(() => Promise.resolve()),
    get: vi.fn(() => Promise.resolve({ id: 1, url: 'https://example.com' })),
    onUpdated: { addListener: vi.fn(), removeListener: vi.fn() },
    onActivated: { addListener: vi.fn(), removeListener: vi.fn() },
  },

  action: {
    setBadgeText: vi.fn(() => Promise.resolve()),
    setBadgeBackgroundColor: vi.fn(() => Promise.resolve()),
    setIcon: vi.fn(() => Promise.resolve()),
    setPopup: vi.fn(() => Promise.resolve()),
    onClicked: { addListener: vi.fn(), removeListener: vi.fn() },
  },

  sidePanel: {
    open: vi.fn(() => Promise.resolve()),
    setOptions: vi.fn(() => Promise.resolve()),
    getOptions: vi.fn(() => Promise.resolve({})),
  },
};
