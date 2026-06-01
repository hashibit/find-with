import { describe, it, expect } from 'vitest';

/**
 * Pure token-expiry logic extracted from src/background/auth.ts.
 * Re-implemented inline to avoid Chrome API dependency in tests.
 *
 * The core rule: tokens are considered "expiring soon" when the current time
 * (Unix seconds) exceeds expires_at minus a 300-second buffer.
 */

const BUFFER_SECONDS = 300;

function isExpiringSoon(expiresAt: number, nowSeconds: number): boolean {
  return nowSeconds > expiresAt - BUFFER_SECONDS;
}

function isTokenMissing(token: string | undefined | null): boolean {
  return !token;
}

describe('isExpiringSoon', () => {
  it('returns false when token is well before the buffer window', () => {
    const expiresAt = 10000;
    const now = 9000; // 1000s before expiry, outside the 300s buffer
    expect(isExpiringSoon(expiresAt, now)).toBe(false);
  });

  it('returns false at exactly the buffer boundary (strict >)', () => {
    const expiresAt = 10000;
    const now = 9700; // now === expiresAt - 300, condition is >, not >=
    expect(isExpiringSoon(expiresAt, now)).toBe(false);
  });

  it('returns true just inside the buffer window', () => {
    const expiresAt = 10000;
    const now = 9700.001; // 1ms inside the 300s buffer
    expect(isExpiringSoon(expiresAt, now)).toBe(true);
  });

  it('returns true when 299s remain before expiry', () => {
    const expiresAt = 10000;
    const now = 9701; // 299s left — inside the 300s buffer
    expect(isExpiringSoon(expiresAt, now)).toBe(true);
  });

  it('returns true for an already-expired token', () => {
    const expiresAt = 1000;
    const now = 5000;
    expect(isExpiringSoon(expiresAt, now)).toBe(true);
  });

  it('returns true when token expires in exactly 1 second', () => {
    const expiresAt = 10000;
    const now = 9999; // 1s left — well inside 300s buffer
    expect(isExpiringSoon(expiresAt, now)).toBe(true);
  });
});

describe('isTokenMissing', () => {
  it('returns true for undefined token', () => {
    expect(isTokenMissing(undefined)).toBe(true);
  });

  it('returns true for null token', () => {
    expect(isTokenMissing(null)).toBe(true);
  });

  it('returns true for empty string', () => {
    expect(isTokenMissing('')).toBe(true);
  });

  it('returns false for a valid token string', () => {
    expect(isTokenMissing('tok_abc123')).toBe(false);
  });

  it('returns false for a UUID-style token', () => {
    expect(isTokenMissing('a1b2c3d4-e5f6-7890-abcd-ef1234567890')).toBe(false);
  });
});
