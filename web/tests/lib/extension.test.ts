import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { sendToExtension } from '../../src/lib/extension';

afterEach(() => {
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// When chrome is not available (default Node/Server environment)
// ---------------------------------------------------------------------------

describe('sendToExtension — chrome unavailable', () => {
  beforeEach(() => {
    // Ensure chrome is not defined (it isn't in Node, but be explicit)
    vi.stubGlobal('chrome', undefined);
  });

  it('does not throw when chrome is undefined', () => {
    expect(() => sendToExtension({ type: 'AUTH_TOKEN', token: 'tok_x' })).not.toThrow();
  });

  it('is a silent no-op — no unexpected side effects', () => {
    // Just verifying the call completes without error
    sendToExtension({ type: 'ENTITLEMENTS_INVALIDATE' });
  });
});

// ---------------------------------------------------------------------------
// When chrome exists but chrome.runtime is undefined
// ---------------------------------------------------------------------------

describe('sendToExtension — chrome.runtime unavailable', () => {
  beforeEach(() => {
    vi.stubGlobal('chrome', { runtime: undefined });
  });

  it('does not throw when chrome.runtime is undefined', () => {
    expect(() => sendToExtension({ type: 'AUTH_NONCE', nonce: 'n_abc' })).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// When chrome.runtime.sendMessage is unavailable
// ---------------------------------------------------------------------------

describe('sendToExtension — chrome.runtime.sendMessage unavailable', () => {
  beforeEach(() => {
    vi.stubGlobal('chrome', { runtime: {} }); // no sendMessage
  });

  it('does not throw when sendMessage is missing from chrome.runtime', () => {
    expect(() => sendToExtension({ type: 'AUTH_TOKEN', token: 'x' })).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// When chrome is fully available
// ---------------------------------------------------------------------------

describe('sendToExtension — chrome available', () => {
  const sendMessageMock = vi.fn();

  beforeEach(() => {
    sendMessageMock.mockReset();
    vi.stubGlobal('chrome', {
      runtime: { sendMessage: sendMessageMock },
    });
  });

  it('calls chrome.runtime.sendMessage when chrome is fully available', () => {
    sendToExtension({ type: 'AUTH_TOKEN', token: 'tok_abc' });
    expect(sendMessageMock).toHaveBeenCalledTimes(1);
  });

  it('passes the message object to sendMessage', () => {
    const msg = { type: 'AUTH_NONCE', nonce: 'nonce_xyz' };
    sendToExtension(msg);
    const [, receivedMsg] = sendMessageMock.mock.calls[0] as [string, typeof msg];
    expect(receivedMsg).toEqual(msg);
  });

  it('passes the extension ID as the first argument to sendMessage', () => {
    sendToExtension({ type: 'ENTITLEMENTS_INVALIDATE' });
    const [extId] = sendMessageMock.mock.calls[0] as [string, unknown];
    // EXT_ID is process.env.NEXT_PUBLIC_EXTENSION_ID || '' — in test env it is ''
    expect(typeof extId).toBe('string');
  });

  it('forwards additional payload fields in the message', () => {
    const msg = { type: 'AUTH_TOKEN', token: 'tok_xyz', expires_at: 9999999, user_id: 'u_1' };
    sendToExtension(msg);
    const [, received] = sendMessageMock.mock.calls[0] as [string, typeof msg];
    expect(received.expires_at).toBe(9999999);
    expect(received.user_id).toBe('u_1');
  });

  it('can be called multiple times without cross-call interference', () => {
    sendToExtension({ type: 'MSG_A' });
    sendToExtension({ type: 'MSG_B' });
    expect(sendMessageMock).toHaveBeenCalledTimes(2);
    expect(sendMessageMock.mock.calls[0][1]).toEqual({ type: 'MSG_A' });
    expect(sendMessageMock.mock.calls[1][1]).toEqual({ type: 'MSG_B' });
  });
});
