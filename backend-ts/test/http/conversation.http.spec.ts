/**
 * HTTP integration tests — ConversationController
 *
 * The SSE /prompt endpoint is not exercised here — it requires a live LLM
 * stream and belongs in e2e tests. All other lifecycle endpoints are covered.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { getApp, closeApp, AUTH } from './bootstrap.js';
import { type INestApplication } from '@nestjs/common';

let app: INestApplication;

beforeAll(async () => { app = await getApp(); });
afterAll(async () => { await closeApp(); });

describe('POST /api/v1/conversations', () => {
  it('401 without auth', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/conversations')
      .send({ kind: 'FREE_CHAT' });
    expect(res.status).toBe(401);
  });

  it('400 when kind is missing', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/conversations')
      .set(AUTH)
      .send({});
    expect(res.status).toBe(400);
    expect(res.headers['content-type']).toMatch('application/problem+json');
  });

  it('400 when kind is not a valid enum value', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/conversations')
      .set(AUTH)
      .send({ kind: 'DARK_ARTS' });
    expect(res.status).toBe(400);
    expect(res.headers['content-type']).toMatch('application/problem+json');
  });

  let conversationId: string;

  it('creates a conversation', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/conversations')
      .set(AUTH)
      .send({ kind: 'FREE_CHAT' });
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
    conversationId = res.body.id;
  });

  it('GET /api/v1/conversations/:id returns conversation with messages', async () => {
    if (!conversationId) return;
    const res = await request(app.getHttpServer())
      .get(`/api/v1/conversations/${conversationId}`)
      .set(AUTH);
    expect(res.status).toBe(200);
    // findOne returns { conversation: ConvConversation, messages: ConvMessage[] }
    expect(res.body.conversation).toHaveProperty('id', conversationId);
    expect(Array.isArray(res.body.messages)).toBe(true);
  });

  it('GET /api/v1/conversations lists conversations newest first', async () => {
    if (!conversationId) return;
    const res = await request(app.getHttpServer())
      .get('/api/v1/conversations')
      .set(AUTH);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    const ids: string[] = res.body.map((c: { id: string }) => c.id);
    expect(ids).toContain(conversationId);
    // listByUser orders by lastActivity DESC
    const dates: number[] = res.body.map(
      (c: { lastActivity: string }) => new Date(c.lastActivity).getTime(),
    );
    const sorted = [...dates].sort((a, b) => b - a);
    expect(dates).toEqual(sorted);
  });

  it('POST /api/v1/conversations/:id/close enqueues memory job', async () => {
    if (!conversationId) return;
    const res = await request(app.getHttpServer())
      .post(`/api/v1/conversations/${conversationId}/close`)
      .set(AUTH);
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ ok: true });
  });
});

describe('GET /api/v1/conversations/:id — unknown id', () => {
  it('returns 404 for a non-existent conversation', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/conversations/nonexistent-id-xyz')
      .set(AUTH);
    expect(res.status).toBe(404);
    expect(res.headers['content-type']).toMatch('application/problem+json');
  });
});
