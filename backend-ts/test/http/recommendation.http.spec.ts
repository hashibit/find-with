/**
 * HTTP integration tests — RecommendationController
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { getApp, closeApp, AUTH } from './bootstrap.js';
import { type INestApplication } from '@nestjs/common';

let app: INestApplication;

beforeAll(async () => { app = await getApp(); });
afterAll(async () => { await closeApp(); });

describe('GET /api/v1/recommendations', () => {
  it('401 without auth', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/recommendations');
    expect(res.status).toBe(401);
  });

  it('returns recommendations list', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/recommendations')
      .set(AUTH);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

describe('POST /api/v1/recommendations/build', () => {
  it('400 when query is empty string', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/recommendations/build')
      .set(AUTH)
      .send({ query: '' });
    expect(res.status).toBe(400);
    expect(res.headers['content-type']).toMatch('application/problem+json');
  });

  it('400 when query is missing', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/recommendations/build')
      .set(AUTH)
      .send({});
    expect(res.status).toBe(400);
    expect(res.headers['content-type']).toMatch('application/problem+json');
  });

  it('passes DTO validation with valid query', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/recommendations/build')
      .set(AUTH)
      .send({ query: 'Senior PM roles at Series B startups' });
    // May fail at service level (LLM mock) but must not be 400/401
    expect(res.status).not.toBe(400);
    expect(res.status).not.toBe(401);
  });
});

describe('POST /api/v1/recommendations/:id/feedback', () => {
  it('204 with valid payload', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/recommendations/some-reco-id/feedback')
      .set(AUTH)
      .send({ liked: true });
    // 204 on success; service may return 404 if reco doesn't exist — either is fine
    expect([204, 404]).toContain(res.status);
  });

  it('passes with empty body (all fields optional)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/recommendations/some-reco-id/feedback')
      .set(AUTH)
      .send({});
    expect(res.status).not.toBe(400);
    expect(res.status).not.toBe(401);
  });
});

describe('POST /api/v1/recommendations/:id/click', () => {
  it('400 when redirectUrl is not a URL', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/recommendations/some-id/click')
      .set(AUTH)
      .send({ trackingId: 'abc123', redirectUrl: 'not-a-url' });
    expect(res.status).toBe(400);
    expect(res.headers['content-type']).toMatch('application/problem+json');
  });

  it('400 when trackingId missing', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/recommendations/some-id/click')
      .set(AUTH)
      .send({ redirectUrl: 'https://linkedin.com/jobs/view/123' });
    expect(res.status).toBe(400);
    expect(res.headers['content-type']).toMatch('application/problem+json');
  });

  it('404 on invalid HMAC tracking id (security via obscurity)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/recommendations/some-id/click')
      .set(AUTH)
      .send({ trackingId: 'invalid-hmac', redirectUrl: 'https://linkedin.com/jobs/view/123' });
    expect(res.status).toBe(404);
    expect(res.headers['content-type']).toMatch('application/problem+json');
  });
});
