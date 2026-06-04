/**
 * HTTP integration tests — BillingController
 *
 * The test user is seeded in bootstrap with a FREE subscription (no stripeCustomerId).
 * This spec's beforeAll seeds an additional subscription row keyed to TEST_USER_ID
 * (the clerkId used in the session) with a fake stripeCustomerId so portal/resume work.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { getApp, closeApp, AUTH, mockPayment, TEST_USER_ID } from './bootstrap.js';
import { type INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { BillingSubscription } from '../../src/database/entities/billing/subscription.entity.js';
import { ulid } from 'ulid';

let app: INestApplication;

beforeAll(async () => {
  app = await getApp();

  // Ensure a billing subscription row exists for the test user's session userId
  // (clerkId, as that's what the session guard puts on req.user.userId).
  const ds = app.get(DataSource);
  const repo = ds.getRepository(BillingSubscription);
  const existing = await repo.findOne({ where: { userId: TEST_USER_ID } });
  if (!existing) {
    await repo.save(
      repo.create({
        id: ulid(),
        userId: TEST_USER_ID,
        tier: 'PRO',
        state: 'ACTIVE',
        stripeCustomerId: 'cus_test_http_001',
        stripeSubscriptionId: null,
        periodEnd: null,
        pausedReason: null,
        lastEventId: null,
        lastEventAt: null,
      }),
    );
  } else if (!existing.stripeCustomerId) {
    existing.stripeCustomerId = 'cus_test_http_001';
    await repo.save(existing);
  }
});

afterAll(async () => { await closeApp(); });

describe('GET /api/v1/billing/subscription', () => {
  it('401 without auth', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/billing/subscription');
    expect(res.status).toBe(401);
  });

  it('returns subscription', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/billing/subscription')
      .set(AUTH);
    expect(res.status).toBe(200);
  });
});

describe('POST /api/v1/billing/checkout', () => {
  it('400 when priceId missing', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/billing/checkout')
      .set(AUTH)
      .send({ successUrl: 'https://example.com/ok', cancelUrl: 'https://example.com/cancel' });
    expect(res.status).toBe(400);
    expect(res.headers['content-type']).toMatch('application/problem+json');
  });

  it('returns checkout session URL', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/billing/checkout')
      .set(AUTH)
      .send({ priceId: 'price_test_123', successUrl: 'https://example.com/ok', cancelUrl: 'https://example.com/cancel' });
    expect(res.status).toBe(201);
    expect(mockPayment.createCheckoutSession).toHaveBeenCalled();
    expect(res.body).toHaveProperty('url');
  });
});

describe('POST /api/v1/billing/checkout/finalize', () => {
  it('400 when sessionId missing', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/billing/checkout/finalize')
      .set(AUTH)
      .send({});
    expect(res.status).toBe(400);
  });
});

describe('POST /api/v1/billing/portal', () => {
  it('400 when returnUrl missing', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/billing/portal')
      .set(AUTH)
      .send({});
    expect(res.status).toBe(400);
  });

  it('returns portal URL', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/billing/portal')
      .set(AUTH)
      .send({ returnUrl: 'https://example.com/settings' });
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('url');
  });
});

describe('POST /api/v1/billing/resume', () => {
  it('returns ok when subscription exists', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/billing/resume')
      .set(AUTH);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ ok: true });
  });
});
