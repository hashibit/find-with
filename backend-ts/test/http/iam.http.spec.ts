/**
 * HTTP integration tests — IamController + BillingController
 *
 * Exercises the full pipeline:
 *   TestSessionGuard → Controller → ZodValidationPipe → HttpExceptionFilter
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { getApp, closeApp, AUTH, TEST_SESSION_TOKEN } from './bootstrap.js';
import { type INestApplication } from '@nestjs/common';

let app: INestApplication;

beforeAll(async () => { app = await getApp(); });
afterAll(async () => { await closeApp(); });

// ─── Auth pipeline ──────────────────────────────────────────────────────────

describe('TestSessionGuard (auth pipeline)', () => {
  it('returns 401 when Authorization header is missing', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/iam/me');
    expect(res.status).toBe(401);
    expect(res.headers['content-type']).toMatch('application/problem+json');
    expect(res.body).toMatchObject({
      type: 'https://findwith.app/errors/401',
      status: 401,
    });
  });

  it('returns 401 with an unknown session token (64-hex, not in Redis)', async () => {
    // 64 hex chars that are NOT seeded in Redis → guard rejects after Redis lookup
    const unknownToken = 'c'.repeat(64);
    const res = await request(app.getHttpServer())
      .get('/api/v1/iam/me')
      .set('Authorization', `Bearer ${unknownToken}`);
    expect(res.status).toBe(401);
    expect(res.headers['content-type']).toMatch('application/problem+json');
  });

  it('passes through with a Clerk-JWT-format token (non-64-hex) via mock verifier', async () => {
    // Non-session-format tokens (e.g. Clerk JWTs) are forwarded to the auth verifier.
    // In tests the verifier is mocked to accept anything, so this returns 200.
    const res = await request(app.getHttpServer())
      .get('/api/v1/iam/me')
      .set('Authorization', 'Bearer too-short-or-wrong-format');
    expect(res.status).not.toBe(401);
  });

  it('passes through with a valid session token', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/iam/me')
      .set(AUTH);
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
  });
});

// ─── POST /api/v1/iam/me ────────────────────────────────────────────────────

describe('POST /api/v1/iam/me', () => {
  it('upserts user and returns user record', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/iam/me')
      .set(AUTH)
      .send({ email: 'http-test@findwith.local', fullName: 'HTTP Test' });
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
    // clerkUserId is the field name in the DB/entity
    expect(res.body).toHaveProperty('clerkUserId');
  });

  it('400 when email is missing (ZodValidationPipe)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/iam/me')
      .set(AUTH)
      .send({ fullName: 'No Email' });
    expect(res.status).toBe(400);
    expect(res.headers['content-type']).toMatch('application/problem+json');
    expect(res.body.status).toBe(400);
  });
});

// ─── GET /api/v1/iam/me ─────────────────────────────────────────────────────

describe('GET /api/v1/iam/me', () => {
  it('returns user record', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/iam/me')
      .set(AUTH);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('id');
  });
});

// ─── GET /api/v1/iam/me/entitlements ────────────────────────────────────────

describe('GET /api/v1/iam/me/entitlements', () => {
  it('returns entitlements object', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/iam/me/entitlements')
      .set(AUTH);
    expect(res.status).toBe(200);
    expect(res.body).toBeDefined();
  });
});

// ─── GET/PATCH /api/v1/iam/settings ─────────────────────────────────────────

describe('GET /api/v1/iam/settings', () => {
  it('returns settings', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/iam/settings')
      .set(AUTH);
    expect(res.status).toBe(200);
  });
});

describe('PATCH /api/v1/iam/settings', () => {
  it('updates density', async () => {
    const res = await request(app.getHttpServer())
      .patch('/api/v1/iam/settings')
      .set(AUTH)
      .send({ density: 'QUIET' });
    expect(res.status).toBe(200);
  });

  it('400 when density is not a valid enum value (ZodValidationPipe)', async () => {
    const res = await request(app.getHttpServer())
      .patch('/api/v1/iam/settings')
      .set(AUTH)
      .send({ density: 'MAXIMUM_OVERDRIVE' });
    expect(res.status).toBe(400);
    expect(res.headers['content-type']).toMatch('application/problem+json');
  });
});

// ─── POST /api/v1/iam/auth/exchange ─────────────────────────────────────────
// This endpoint reads a nonce and issues a session token. It requires auth
// (called with a Clerk JWT or session token per the real guard spec).

describe('POST /api/v1/iam/auth/exchange', () => {
  it('400 when nonce is too short (ZodValidationPipe)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/iam/auth/exchange')
      .set(AUTH)
      .send({ nonce: 'abc' }); // < 8 chars
    expect(res.status).toBe(400);
    expect(res.headers['content-type']).toMatch('application/problem+json');
  });

  it('400 when nonce contains invalid chars (ZodValidationPipe)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/iam/auth/exchange')
      .set(AUTH)
      .send({ nonce: 'valid!!nonce@@invalid' });
    expect(res.status).toBe(400);
  });

  it('400 when nonce is valid format but not found in store', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/iam/auth/exchange')
      .set(AUTH)
      .send({ nonce: 'validnonce123456' });
    expect(res.status).toBe(400);
    expect(res.body.title).toMatch(/invalid or expired nonce/i);
  });
});

// ─── POST /api/v1/iam/auth/verify ───────────────────────────────────────────

describe('POST /api/v1/iam/auth/verify', () => {
  it('issues a session token when Clerk JWT is valid (mocked verifier)', async () => {
    // Called with an existing session token for auth; body contains the Clerk JWT
    const res = await request(app.getHttpServer())
      .post('/api/v1/iam/auth/verify')
      .set(AUTH)
      .send({ clerkToken: 'mock.clerk.jwt' });
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('token');
    expect(res.body).toHaveProperty('expires_at');
    expect(res.body).toHaveProperty('user_id');
    // token must be 64 lowercase hex chars
    expect(res.body.token).toMatch(/^[0-9a-f]{64}$/);
  });

  it('400 when clerkToken field is missing (ZodValidationPipe)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/iam/auth/verify')
      .set(AUTH)
      .send({});
    expect(res.status).toBe(400);
    expect(res.headers['content-type']).toMatch('application/problem+json');
  });
});

// ─── Account lifecycle ───────────────────────────────────────────────────────

describe('DELETE /api/v1/iam/account', () => {
  it('initiates deletion saga', async () => {
    const res = await request(app.getHttpServer())
      .delete('/api/v1/iam/account')
      .set(AUTH);
    expect(res.status).toBe(200);
  });
});

describe('POST /api/v1/iam/account/cancel-deletion', () => {
  it('cancels pending deletion', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/iam/account/cancel-deletion')
      .set(AUTH);
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ ok: true });
  });
});

describe('POST /api/v1/iam/account:export', () => {
  it('returns JSON attachment', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/iam/account:export')
      .set(AUTH);
    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toMatch(/attachment/);
  });
});
