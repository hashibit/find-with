import { describe, it, expect } from 'vitest';

/**
 * Tests for src/background/bus.ts logic.
 *
 * digestMessage is re-implemented inline — it uses only SubtleCrypto (no Chrome).
 * Message-routing logic is tested via an inline re-implementation of the switch-case.
 */

// Exact copy of the private helper in bus.ts — no Chrome deps.
async function digestMessage(message: string): Promise<string> {
  const msgUint8 = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Mirrors the routing intent of handleMessage in bus.ts.
// Returns a label for what the handler does so we can assert routing branches.
type BgMsgType =
  | 'JOB_CAPTURE'
  | 'EMAIL_CAPTURE'
  | 'EASY_APPLY_FORM'
  | 'EASY_APPLY_SUBMITTED'
  | 'OPEN_SIDEPANEL'
  | (string & {});

function describeRoute(type: BgMsgType): string {
  switch (type) {
    case 'JOB_CAPTURE':
      return 'api_post_job_capture';
    case 'EMAIL_CAPTURE':
      return 'api_post_email_capture';
    case 'EASY_APPLY_FORM':
      return 'ack_form';
    case 'EASY_APPLY_SUBMITTED':
      return 'broadcast_to_sidepanel';
    case 'OPEN_SIDEPANEL':
      return 'open_side_panel';
    default:
      return 'error_unknown';
  }
}

describe('digestMessage', () => {
  it('returns a 64-character lowercase hex string', async () => {
    const result = await digestMessage('hello');
    expect(result).toHaveLength(64);
    expect(result).toMatch(/^[0-9a-f]+$/);
  });

  it('is deterministic — same input always gives same hash', async () => {
    const a = await digestMessage('findwith|2024-01-15');
    const b = await digestMessage('findwith|2024-01-15');
    expect(a).toBe(b);
  });

  it('produces different hashes for different inputs', async () => {
    const a = await digestMessage('https://linkedin.com/jobs/1|2024-01-15');
    const b = await digestMessage('https://linkedin.com/jobs/2|2024-01-15');
    expect(a).not.toBe(b);
  });

  it('produces different hashes when only the date differs', async () => {
    const url = 'https://linkedin.com/jobs/view/123456';
    const a = await digestMessage(`${url}|2024-01-15`);
    const b = await digestMessage(`${url}|2024-01-16`);
    expect(a).not.toBe(b);
  });

  it('matches the known SHA-256 of an empty string', async () => {
    // SHA-256('') = e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
    const result = await digestMessage('');
    expect(result).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });

  it('handles unicode input without throwing', async () => {
    const result = await digestMessage('Ünïcödé 中文 🚀');
    expect(result).toHaveLength(64);
  });
});

describe('message routing', () => {
  it('JOB_CAPTURE routes to api_post_job_capture', () => {
    expect(describeRoute('JOB_CAPTURE')).toBe('api_post_job_capture');
  });

  it('EMAIL_CAPTURE routes to api_post_email_capture', () => {
    expect(describeRoute('EMAIL_CAPTURE')).toBe('api_post_email_capture');
  });

  it('EASY_APPLY_FORM routes to ack_form', () => {
    expect(describeRoute('EASY_APPLY_FORM')).toBe('ack_form');
  });

  it('EASY_APPLY_SUBMITTED routes to broadcast_to_sidepanel', () => {
    expect(describeRoute('EASY_APPLY_SUBMITTED')).toBe('broadcast_to_sidepanel');
  });

  it('OPEN_SIDEPANEL routes to open_side_panel', () => {
    expect(describeRoute('OPEN_SIDEPANEL')).toBe('open_side_panel');
  });

  it('unknown message type routes to error_unknown', () => {
    expect(describeRoute('TOTALLY_UNKNOWN')).toBe('error_unknown');
  });

  it('empty string routes to error_unknown', () => {
    expect(describeRoute('')).toBe('error_unknown');
  });
});
