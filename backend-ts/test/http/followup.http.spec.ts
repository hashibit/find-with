/**
 * HTTP integration tests — FollowupController
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { getApp, closeApp, AUTH } from './bootstrap.js';
import { type INestApplication } from '@nestjs/common';

let app: INestApplication;

beforeAll(async () => { app = await getApp(); });
afterAll(async () => { await closeApp(); });

describe('GET /api/v1/followup/emails', () => {
  it('401 without auth', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/followup/emails');
    expect(res.status).toBe(401);
  });

  it('returns emails list', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/followup/emails')
      .set(AUTH);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

describe('POST /api/v1/followup/emails', () => {
  it('captures email with all optional fields empty', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/followup/emails')
      .set(AUTH)
      .send({});
    // CaptureEmailDto has all optional fields — empty body is valid
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
  });

  it('captures email with full payload', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/followup/emails')
      .set(AUTH)
      .send({
        subject: 'Interview Invitation — Senior Engineer at Acme',
        fromAddr: 'recruiter@acme.com',
        bodyText: 'We would like to invite you for an interview...',
      });
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
  });
});

describe('GET /api/v1/followup/drafts', () => {
  it('returns drafts list', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/followup/drafts')
      .set(AUTH);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});
