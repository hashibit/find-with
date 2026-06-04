/**
 * HTTP integration tests — TailoringController
 *
 * Note: `start` enqueues an async processor job — it returns immediately
 * with a pending entity. The processor itself is not triggered in HTTP tests.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { getApp, closeApp, AUTH } from './bootstrap.js';
import { type INestApplication } from '@nestjs/common';

let app: INestApplication;

beforeAll(async () => { app = await getApp(); });
afterAll(async () => { await closeApp(); });

describe('POST /api/v1/tailoring', () => {
  it('401 without auth', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/tailoring')
      .send({ baseResumeId: 'br_1', parsedJdId: 'jd_1' });
    expect(res.status).toBe(401);
  });

  it('400 when baseResumeId missing', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/tailoring')
      .set(AUTH)
      .send({ parsedJdId: 'jd_1' });
    expect(res.status).toBe(400);
    expect(res.headers['content-type']).toMatch('application/problem+json');
  });

  it('400 when parsedJdId missing', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/tailoring')
      .set(AUTH)
      .send({ baseResumeId: 'br_1' });
    expect(res.status).toBe(400);
    expect(res.headers['content-type']).toMatch('application/problem+json');
  });

  it('returns 201 with non-existent IDs — start is async, no eager FK validation', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/tailoring')
      .set(AUTH)
      .send({ baseResumeId: 'nonexistent', parsedJdId: 'nonexistent' });
    // start() saves entity + enqueues queue job immediately; FK resolution happens async
    expect(res.status).toBe(201);
    expect(res.status).not.toBe(401);
  });
});

describe('GET /api/v1/tailoring/:id', () => {
  it('404 for non-existent tailored resume', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/tailoring/nonexistent-tailoring-id')
      .set(AUTH);
    expect(res.status).toBe(404);
    expect(res.headers['content-type']).toMatch('application/problem+json');
  });
});

describe('PATCH /api/v1/tailoring/:id/bullets/:bulletId', () => {
  it('400 when text is missing', async () => {
    const res = await request(app.getHttpServer())
      .patch('/api/v1/tailoring/some-id/bullets/some-bullet')
      .set(AUTH)
      .send({ kind: 'direct' });
    expect(res.status).toBe(400);
    expect(res.headers['content-type']).toMatch('application/problem+json');
  });

  it('400 when kind is invalid enum', async () => {
    const res = await request(app.getHttpServer())
      .patch('/api/v1/tailoring/some-id/bullets/some-bullet')
      .set(AUTH)
      .send({ text: 'Updated bullet', kind: 'telepathic' });
    expect(res.status).toBe(400);
    expect(res.headers['content-type']).toMatch('application/problem+json');
  });
});

describe('POST /api/v1/tailoring/:id/bullets/:bulletId/source', () => {
  it('400 when materialId missing', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/tailoring/some-id/bullets/some-bullet/source')
      .set(AUTH)
      .send({});
    expect(res.status).toBe(400);
    expect(res.headers['content-type']).toMatch('application/problem+json');
  });
});

describe('GET /api/v1/tailoring/:id/export', () => {
  it('404 for non-existent tailored resume', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/tailoring/nonexistent-id/export')
      .set(AUTH);
    expect(res.status).toBe(404);
    expect(res.headers['content-type']).toMatch('application/problem+json');
  });
});
