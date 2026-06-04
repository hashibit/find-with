/**
 * HTTP integration tests — ApplyController
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { getApp, closeApp, AUTH } from './bootstrap.js';
import { type INestApplication } from '@nestjs/common';

let app: INestApplication;

beforeAll(async () => { app = await getApp(); });
afterAll(async () => { await closeApp(); });

describe('POST /api/v1/apply/plan', () => {
  it('401 without auth', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/apply/plan')
      .send({ radarItemId: 'r_1' });
    expect(res.status).toBe(401);
  });

  it('400 when radarItemId missing', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/apply/plan')
      .set(AUTH)
      .send({});
    expect(res.status).toBe(400);
    expect(res.headers['content-type']).toMatch('application/problem+json');
  });

  it('4xx when radar item does not exist', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/apply/plan')
      .set(AUTH)
      .send({ radarItemId: 'nonexistent-radar-id' });
    expect(res.status).not.toBe(401);
    expect([404, 422]).toContain(res.status);
    expect(res.headers['content-type']).toMatch('application/problem+json');
  });
});

describe('PATCH /api/v1/apply/plan/:id/approve', () => {
  it('401 without auth', async () => {
    const res = await request(app.getHttpServer())
      .patch('/api/v1/apply/plan/some-id/approve');
    expect(res.status).toBe(401);
  });

  it('404 for non-existent plan', async () => {
    const res = await request(app.getHttpServer())
      .patch('/api/v1/apply/plan/nonexistent-plan-id/approve')
      .set(AUTH);
    expect(res.status).toBe(404);
    expect(res.headers['content-type']).toMatch('application/problem+json');
  });
});

describe('POST /api/v1/apply/submit', () => {
  it('400 when radarItemId missing', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/apply/submit')
      .set(AUTH)
      .send({});
    expect(res.status).toBe(400);
    expect(res.headers['content-type']).toMatch('application/problem+json');
  });

  it('201 when radar item does not exist — recordSubmission has no eager FK check', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/apply/submit')
      .set(AUTH)
      .send({ radarItemId: 'nonexistent-radar-id' });
    // recordSubmission() does create+save+update with no NotFoundException guard
    expect(res.status).toBe(201);
    expect(res.status).not.toBe(401);
  });
});
