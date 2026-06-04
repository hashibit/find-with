/**
 * HTTP integration tests — admin API endpoints.
 *
 * AdminGuard uses X-Admin-Secret header (NOT the TestSessionGuard Bearer token).
 * These tests boot the same full AppModule as other http specs but call
 * admin/* routes directly without the TestSessionGuard override.
 *
 * ADMIN_SECRET is loaded from .env.test:
 *   ADMIN_SECRET=test-admin-secret-32-chars-minimum
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { getApp, closeApp } from './bootstrap.js';
import { type INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { TelemetryEvent } from '../../src/database/entities/telemetry/telemetry-event.entity.js';

const ADMIN_SECRET = process.env.ADMIN_SECRET ?? 'test-admin-secret-32-chars-minimum';
const ADMIN = { 'x-admin-secret': ADMIN_SECRET };
const WRONG = { 'x-admin-secret': 'wrong-secret' };

let app: INestApplication;
let ds: DataSource;

beforeAll(async () => {
  app = await getApp();
  ds = app.get(DataSource);
});
afterAll(async () => { await closeApp(); });

// ─── AdminGuard — auth pipeline ─────────────────────────────────────────────

describe('AdminGuard auth pipeline', () => {
  it('GET /admin/api/health without header → 401', async () => {
    const res = await request(app.getHttpServer()).get('/admin/api/health');
    expect(res.status).toBe(401);
  });

  it('GET /admin/api/health with wrong secret → 401', async () => {
    const res = await request(app.getHttpServer())
      .get('/admin/api/health')
      .set(WRONG);
    expect(res.status).toBe(401);
  });

  it('wrong secret emits admin.auth.failure TelemetryEvent to DB', async () => {
    // Clear prior failures to get a clean count
    await ds.getRepository(TelemetryEvent).delete({ eventType: 'admin.auth.failure' });

    await request(app.getHttpServer())
      .get('/admin/api/health')
      .set({ 'x-admin-secret': 'incorrect-value' });

    const count = await ds.getRepository(TelemetryEvent).count({ where: { eventType: 'admin.auth.failure' } });
    expect(count).toBeGreaterThanOrEqual(1);
  });
});

// ─── GET /admin/api/health ──────────────────────────────────────────────────

describe('GET /admin/api/health', () => {
  it('returns 200 with correct secret', async () => {
    const res = await request(app.getHttpServer())
      .get('/admin/api/health')
      .set(ADMIN);
    expect(res.status).toBe(200);
  });

  it('response body has status, timestamp, services shape', async () => {
    const res = await request(app.getHttpServer())
      .get('/admin/api/health')
      .set(ADMIN);
    expect(res.body).toMatchObject({
      status: expect.stringMatching(/^(ok|degraded|down)$/),
      timestamp: expect.any(String),
      services: expect.objectContaining({
        redis: expect.any(Object),
        postgres: expect.any(Object),
        s3: expect.any(Object),
        llm: expect.any(Object),
        queues: expect.any(Object),
      }),
    });
  });

  it('postgres service is ok (test DB is running)', async () => {
    const res = await request(app.getHttpServer())
      .get('/admin/api/health')
      .set(ADMIN);
    expect(res.body.services.postgres.status).toBe('ok');
  });

  it('redis service is ok (test Redis is running)', async () => {
    const res = await request(app.getHttpServer())
      .get('/admin/api/health')
      .set(ADMIN);
    expect(res.body.services.redis.status).toBe('ok');
  });
});

// ─── GET /admin/api/metrics/overview ────────────────────────────────────────

describe('GET /admin/api/metrics/overview', () => {
  it('returns 401 without header', async () => {
    const res = await request(app.getHttpServer()).get('/admin/api/metrics/overview');
    expect(res.status).toBe(401);
  });

  it('returns 200 with correct secret', async () => {
    const res = await request(app.getHttpServer())
      .get('/admin/api/metrics/overview')
      .set(ADMIN);
    expect(res.status).toBe(200);
  });

  it('response body has expected shape', async () => {
    const res = await request(app.getHttpServer())
      .get('/admin/api/metrics/overview')
      .set(ADMIN);
    expect(res.body).toMatchObject({
      users: expect.objectContaining({
        total: expect.any(Number),
        newToday: expect.any(Number),
        newLast7d: expect.any(Number),
      }),
      conversion: expect.objectContaining({ proConversions: expect.any(Number) }),
      operations: expect.objectContaining({ tailoringsToday: expect.any(Number) }),
      offers: expect.objectContaining({
        offerAcceptedTotal: expect.any(Number),
        offerAcceptedLast30d: expect.any(Number),
      }),
      agent: expect.objectContaining({ agentIterationExhaustedToday: expect.any(Number) }),
    });
  });
});

// ─── Rate limiting ───────────────────────────────────────────────────────────

describe('Rate limiting on admin endpoints', () => {
  it('exhausting the 5-per-60s limit yields 429', async () => {
    // Throttle limit is 5 per 60s (shared in-memory storage, single-fork run).
    // Fire up to 10 requests — at least one must be 429 once the limit is hit.
    const server = app.getHttpServer();
    const statuses: number[] = [];
    for (let i = 0; i < 10; i++) {
      const r = await request(server).get('/admin/api/metrics/overview').set(ADMIN);
      statuses.push(r.status);
    }
    expect(statuses).toContain(429);
  });
});
