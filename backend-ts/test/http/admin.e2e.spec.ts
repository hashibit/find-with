/**
 * Admin E2E flow test — covers the admin stack via HTTP.
 *
 * Flows exercised:
 *  1. Admin API  — X-Admin-Secret → health / metrics endpoints
 *  2. Bull Board — X-Admin-Secret → /admin/queues
 *  3. Negative   — bad credentials
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { getApp, closeApp } from './bootstrap.js';
import { type INestApplication } from '@nestjs/common';

const ADMIN_SECRET = process.env.ADMIN_SECRET ?? 'test-admin-secret-32-chars-minimum';
const ADMIN_HEADER = { 'x-admin-secret': ADMIN_SECRET };

let app: INestApplication;

beforeAll(async () => { app = await getApp(); });
afterAll(async () => { await closeApp(); });

// ─── Flow 1 (formerly Flow 2): Admin REST API (X-Admin-Secret) ──────────────

describe('Flow 1: Admin REST API — health → metrics chain', () => {
  it('health endpoint returns ok/degraded status with full shape', async () => {
    const res = await request(app.getHttpServer())
      .get('/admin/ops/health')
      .set(ADMIN_HEADER);

    expect(res.status).toBe(200);
    expect(res.body.status).toMatch(/^(ok|degraded|down)$/);
    expect(res.body.services.postgres.status).toBe('ok');
    expect(res.body.services.redis.status).toBe('ok');
  });

  it('metrics endpoint returns numeric values', async () => {
    const res = await request(app.getHttpServer())
      .get('/admin/ops/metrics/overview')
      .set(ADMIN_HEADER);

    expect(res.status).toBe(200);
    expect(res.body.users.total).toBeGreaterThanOrEqual(0);
    expect(res.body.conversion.proConversions).toBeGreaterThanOrEqual(0);
  });

  it('wrong X-Admin-Secret on health → 401', async () => {
    const res = await request(app.getHttpServer())
      .get('/admin/ops/health')
      .set({ 'x-admin-secret': 'not-the-real-secret' });
    expect(res.status).toBe(401);
  });

  it('wrong X-Admin-Secret on metrics → 401', async () => {
    const res = await request(app.getHttpServer())
      .get('/admin/ops/metrics/overview')
      .set({ 'x-admin-secret': 'not-the-real-secret' });
    expect(res.status).toBe(401);
  });
});

// ─── Flow 3: Bull Board ──────────────────────────────────────────────────────

describe('Flow 2: Bull Board queue dashboard (/admin/queues)', () => {
  it('GET /admin/queues without header → 401', async () => {
    const res = await request(app.getHttpServer()).get('/admin/queues');
    expect(res.status).toBe(401);
  });

  it('GET /admin/queues with correct secret → not 401', async () => {
    const res = await request(app.getHttpServer())
      .get('/admin/queues')
      .set(ADMIN_HEADER);
    // Bull Board returns 200 for dashboard HTML or JSON API
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
  });
});
