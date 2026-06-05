/**
 * J-07: Billing — Subscription & Upgrade flow
 *
 * Pure API tests — no browser context required.
 * Uses e2e-user-1 (PRO) and e2e-user-free (FREE, quota at limit).
 */
import { test, expect } from '../fixtures/extension.js';
import { apiCall, E2E_USER_ID, E2E_USER_FREE } from '../helpers/sidepanel.js';

test.describe('J-07: Billing — Subscription & Upgrade', () => {
  test('GET /billing/subscription returns FREE tier for e2e-user-free', async () => {
    const res = await apiCall('GET', '/billing/subscription', undefined, E2E_USER_FREE);
    expect(res.status).toBe(200);
    const body = await res.json() as { tier: string };
    expect(body.tier.toUpperCase()).toBe('FREE');
  });

  test('GET /billing/subscription returns PRO for e2e-user-1', async () => {
    const res = await apiCall('GET', '/billing/subscription');
    expect(res.status).toBe(200);
    const body = await res.json() as { tier: string };
    expect(body.tier.toUpperCase()).toBe('PRO');
  });

  test('POST /billing/checkout returns a checkout URL', async () => {
    const res = await apiCall('POST', '/billing/checkout', {
      priceId: 'price_pro_monthly',
      successUrl: 'https://findwith.com/success',
      cancelUrl: 'https://findwith.com/cancel',
    });
    expect([200, 201]).toContain(res.status);
    const body = await res.json() as { url: string };
    expect(typeof body.url).toBe('string');
    expect(body.url).toContain('http');
  });

  test('POST /billing/portal requires existing Stripe customer', async () => {
    // e2e-user-1 has no stripeCustomerId in seed — expect 404 (NotFoundException)
    const res = await apiCall('POST', '/billing/portal', {
      returnUrl: 'https://findwith.com/dashboard',
    });
    // Without a Stripe customer ID the service throws NotFoundException → 404
    expect(res.status).toBe(404);
  });

  test('POST /billing/resume returns ok for non-paused user', async () => {
    // Endpoint is /billing/resume (not /billing/subscription/resume)
    const res = await apiCall('POST', '/billing/resume', {});
    expect([200, 201]).toContain(res.status);
    const body = await res.json() as { ok: boolean };
    expect(body.ok).toBe(true);
  });
});
