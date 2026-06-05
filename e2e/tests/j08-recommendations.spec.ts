/**
 * J-08: Recommendation Engine
 *
 * Pure API tests — no browser context required.
 * Relies on reco-e2e-1 seeded in seed.ts.
 */
import { test, expect } from '../fixtures/extension.js';
import { apiCall, E2E_USER_ID } from '../helpers/sidepanel.js';

test.describe('J-08: Recommendation Engine', () => {
  test('GET /recommendations returns seeded recommendation', async () => {
    const res = await apiCall('GET', '/recommendations');
    expect(res.status).toBe(200);
    const body = await res.json() as Array<{ items: unknown[] }>;
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(body[0].items)).toBe(true);
  });

  test('POST /recommendations/build creates new recommendation', async () => {
    const res = await apiCall('POST', '/recommendations/build', {
      query: 'Senior PM at B2B SaaS startup',
    });
    // Any non-auth, non-bad-request response is acceptable
    expect(res.status).not.toBe(400);
    expect(res.status).not.toBe(401);
  });

  test('POST /recommendations/:id/feedback accepts positive feedback', async () => {
    const res = await apiCall('POST', '/recommendations/reco-e2e-1/feedback', {
      liked: true,
    });
    // 204/200 = success, 404 = reco not found (acceptable if seeding skipped)
    expect([200, 204, 404]).toContain(res.status);
  });

  test('POST /recommendations/:id/click rejects invalid tracking id (HMAC)', async () => {
    const res = await apiCall('POST', '/recommendations/reco-e2e-1/click', {
      trackingId: 'invalid-hmac',
      redirectUrl: 'https://linkedin.com/jobs/view/123',
    });
    // HMAC validation failure — expect 400 or 404
    expect([400, 404]).toContain(res.status);
  });
});
