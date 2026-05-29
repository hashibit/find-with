import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests for the SSE block parser extracted from src/background/sse.ts.
 * We re-implement the parser here so tests don't need a Chrome environment.
 */

interface SseEvent {
  id?: string;
  event?: string;
  data: string;
}

function parseSseBlock(block: string): SseEvent | null {
  const lines = block.split('\n');
  let id: string | undefined;
  let event: string | undefined;
  const dataLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith(':')) continue; // comment

    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;

    const field = line.slice(0, colonIdx);
    const value = line.slice(colonIdx + 1).trimStart();

    switch (field) {
      case 'id':
        id = value;
        break;
      case 'event':
        event = value;
        break;
      case 'data':
        dataLines.push(value);
        break;
    }
  }

  if (dataLines.length === 0) return null;

  return { id, event, data: dataLines.join('\n') };
}

/**
 * Splits an SSE stream string into blocks separated by double newlines.
 * Returns parsed events, filtering nulls (comment-only blocks, heartbeats).
 */
function parseSseStream(raw: string): SseEvent[] {
  const blocks = raw.split('\n\n');
  return blocks.map(parseSseBlock).filter((e): e is SseEvent => e !== null);
}

describe('parseSseBlock', () => {
  it('parses a minimal data-only event', () => {
    const block = 'data: hello world';
    const ev = parseSseBlock(block);
    expect(ev).toEqual({ data: 'hello world', id: undefined, event: undefined });
  });

  it('parses an event with id and event type', () => {
    const block = 'id: 42\nevent: job_update\ndata: {"status":"applied"}';
    const ev = parseSseBlock(block);
    expect(ev).toEqual({
      id: '42',
      event: 'job_update',
      data: '{"status":"applied"}',
    });
  });

  it('joins multi-line data fields with newline', () => {
    const block = 'data: line one\ndata: line two\ndata: line three';
    const ev = parseSseBlock(block);
    expect(ev?.data).toBe('line one\nline two\nline three');
  });

  it('returns null for comment-only block', () => {
    const block = ': heartbeat\n: keep-alive';
    expect(parseSseBlock(block)).toBeNull();
  });

  it('returns null for empty block', () => {
    expect(parseSseBlock('')).toBeNull();
  });

  it('strips leading space after colon per SSE spec', () => {
    const block = 'data: value with leading space';
    const ev = parseSseBlock(block);
    expect(ev?.data).toBe('value with leading space');
  });

  it('handles data with no space after colon', () => {
    const block = 'data:no-space-value';
    const ev = parseSseBlock(block);
    // trimStart removes 0 chars when no space present
    expect(ev?.data).toBe('no-space-value');
  });

  it('ignores unknown fields', () => {
    const block = 'data: ok\nretry: 3000\nunknown: value';
    const ev = parseSseBlock(block);
    expect(ev?.data).toBe('ok');
    expect(ev).not.toHaveProperty('retry');
  });

  it('handles JSON data payload', () => {
    const payload = JSON.stringify({ type: 'SSE_EVENT', jobId: 'j_123', score: 0.87 });
    const block = `id: 1\nevent: score_ready\ndata: ${payload}`;
    const ev = parseSseBlock(block);
    expect(ev?.event).toBe('score_ready');
    expect(JSON.parse(ev!.data)).toMatchObject({ type: 'SSE_EVENT', score: 0.87 });
  });

  it('skips lines with no colon', () => {
    const block = 'data: valid\nbadline';
    const ev = parseSseBlock(block);
    expect(ev?.data).toBe('valid');
  });
});

describe('parseSseStream (split events)', () => {
  it('parses multiple events separated by double newline', () => {
    const stream = ['id: 1\ndata: first', 'id: 2\ndata: second', 'id: 3\ndata: third'].join('\n\n');

    const events = parseSseStream(stream);
    expect(events).toHaveLength(3);
    expect(events[0].data).toBe('first');
    expect(events[2].id).toBe('3');
  });

  it('filters out comment-only heartbeat blocks', () => {
    const stream = 'data: real\n\n: heartbeat\n\ndata: also real';
    const events = parseSseStream(stream);
    expect(events).toHaveLength(2);
    expect(events.every((e) => e.data !== '')).toBe(true);
  });

  it('handles a stream with trailing double newline', () => {
    const stream = 'data: only one\n\n';
    const events = parseSseStream(stream);
    expect(events).toHaveLength(1);
    expect(events[0].data).toBe('only one');
  });

  it('handles a stream with mixed events and comments', () => {
    const stream = [
      ': keep-alive',
      'id: 10\nevent: ping\ndata: {}',
      ': another comment',
      'id: 11\nevent: update\ndata: {"x":1}',
    ].join('\n\n');

    const events = parseSseStream(stream);
    expect(events).toHaveLength(2);
    expect(events[0].event).toBe('ping');
    expect(events[1].event).toBe('update');
  });
});
