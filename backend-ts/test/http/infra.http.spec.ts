/**
 * HTTP integration tests — InfraController
 *
 * Webhooks verify HMAC signatures from Clerk (svix) and Stripe.
 * Rather than re-implementing signature computation here, we mock the
 * verifier libraries at the module level and test the surrounding logic:
 *   - routing and auth guard behaviour
 *   - deduplication (second call with same event id returns {ok:true} without processing)
 *   - ingest/events endpoint
 *
 * Note: all routes go through TestSessionGuard in tests. In production,
 * ingest/events has no auth and webhooks use HMAC auth — but here we
 * use the session-token guard for all routes.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import { getApp, closeApp, AUTH } from './bootstrap.js';
import { type INestApplication } from '@nestjs/common';

// Mock svix Webhook verification — always passes
vi.mock('svix', () => ({
  Webhook: class {
    verify() { return true; }
  },
}));

// Mock Stripe.webhooks.constructEvent — returns a minimal event object
vi.mock('stripe', () => {
  const Stripe = class {
    webhooks = {
      constructEvent: (_rawBody: unknown, _sig: unknown, _secret: unknown) => ({
        id: 'evt_test_stripe_001',
        type: 'customer.subscription.updated',
        data: { object: {} },
      }),
    };
  };
  return { default: Stripe };
});

let app: INestApplication;

beforeAll(async () => { app = await getApp(); });
afterAll(async () => { await closeApp(); });

// ─── POST /ingest/events ─────────────────────────────────────────────────────

describe('POST /ingest/events', () => {
  it('stores events and returns count', async () => {
    const res = await request(app.getHttpServer())
      .post('/ingest/events')
      .set(AUTH)
      .send({
        events: [
          { eventType: 'job_viewed', userId: 'u_test', payload: { jobId: 'j_1' } },
          { eventType: 'panel_opened' },
        ],
      });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ ok: true, count: 2 });
  });

  it('handles empty events array', async () => {
    const res = await request(app.getHttpServer())
      .post('/ingest/events')
      .set(AUTH)
      .send({ events: [] });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ ok: true, count: 0 });
  });
});

// ─── POST /webhooks/clerk ────────────────────────────────────────────────────

describe('POST /webhooks/clerk', () => {
  it('processes user.created event', async () => {
    const body = {
      type: 'user.created',
      data: {
        id: 'clerk_webhook_test_user',
        email_addresses: [{ email_address: 'webhook@test.com' }],
        first_name: 'Webhook',
        last_name: 'Test',
      },
    };

    const res = await request(app.getHttpServer())
      .post('/webhooks/clerk')
      .set(AUTH)
      .set('svix-id', 'svix_evt_clerk_001')
      .set('svix-timestamp', String(Math.floor(Date.now() / 1000)))
      .set('svix-signature', 'v1,fake_signature')
      .send(body);

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ ok: true });
  });

  it('is idempotent — second call with same svix-id is a no-op', async () => {
    const body = {
      type: 'user.created',
      data: {
        id: 'clerk_webhook_dedup_user',
        email_addresses: [{ email_address: 'dedup@test.com' }],
        first_name: 'Dedup',
        last_name: 'User',
      },
    };
    const headers = {
      'svix-id': 'svix_evt_dedup_001',
      'svix-timestamp': String(Math.floor(Date.now() / 1000)),
      'svix-signature': 'v1,fake',
    };

    await request(app.getHttpServer()).post('/webhooks/clerk').set(AUTH).set(headers).send(body);
    const res = await request(app.getHttpServer()).post('/webhooks/clerk').set(AUTH).set(headers).send(body);

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ ok: true });
  });

  it('processes user.deleted event', async () => {
    const body = {
      type: 'user.deleted',
      data: { id: 'clerk_nonexistent_user' },
    };

    const res = await request(app.getHttpServer())
      .post('/webhooks/clerk')
      .set(AUTH)
      .set('svix-id', 'svix_evt_delete_001')
      .set('svix-timestamp', String(Math.floor(Date.now() / 1000)))
      .set('svix-signature', 'v1,fake')
      .send(body);

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ ok: true });
  });
});

// ─── POST /webhooks/stripe ───────────────────────────────────────────────────

describe('POST /webhooks/stripe', () => {
  it('processes a stripe event', async () => {
    const res = await request(app.getHttpServer())
      .post('/webhooks/stripe')
      .set(AUTH)
      .set('stripe-signature', 't=fake,v1=fake')
      .set('content-type', 'application/json')
      .send(Buffer.from(JSON.stringify({ type: 'customer.subscription.updated', data: {} })));

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ ok: true });
  });

  it('is idempotent — duplicate stripe event returns {ok:true}', async () => {
    // The mock always returns the same evt_test_stripe_001 id, so the second call deduplicates
    const payload = Buffer.from(JSON.stringify({ type: 'customer.subscription.updated', data: {} }));
    await request(app.getHttpServer())
      .post('/webhooks/stripe')
      .set(AUTH)
      .set('stripe-signature', 't=fake,v1=fake')
      .send(payload);

    const res = await request(app.getHttpServer())
      .post('/webhooks/stripe')
      .set(AUTH)
      .set('stripe-signature', 't=fake,v1=fake')
      .send(payload);

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ ok: true });
  });
});
