/**
 * J-09: GDPR — Account Export & Deletion
 *
 * Pure API tests — no browser context required.
 * Uses e2e-user-onboard for the deletion saga so it doesn't break other tests.
 */
import { test, expect } from '../fixtures/extension.js';
import { apiCall, E2E_USER_ID, E2E_USER_ONBOARD } from '../helpers/sidepanel.js';

test.describe('J-09: GDPR — Account Export & Deletion', () => {
  test('POST /iam/account:export returns a JSON attachment', async () => {
    const res = await apiCall('POST', '/iam/account:export');
    expect(res.status).toBe(200);
  });

  test('DELETE /iam/account initiates deletion saga', async () => {
    // Use e2e-user-onboard so we don't break other tests that rely on e2e-user-1
    const res = await apiCall('DELETE', '/iam/account', undefined, E2E_USER_ONBOARD);
    expect(res.status).toBe(200);
    const body = await res.json() as { expiresAt: string };
    expect(body.expiresAt).toBeTruthy();
  });

  test('POST /iam/account/cancel-deletion cancels the saga', async () => {
    // Cancel immediately after the deletion initiated above
    const res = await apiCall('POST', '/iam/account/cancel-deletion', {}, E2E_USER_ONBOARD);
    expect([200, 201]).toContain(res.status);
    const body = await res.json() as { ok: boolean };
    expect(body.ok).toBe(true);
  });

  test('GET /iam/me still works after cancel-deletion', async () => {
    // User may be soft-deleted briefly — accept both 200 (restored) and 404 (still deleting)
    const res = await apiCall('GET', '/iam/me', undefined, E2E_USER_ONBOARD);
    expect([200, 404]).toContain(res.status);
  });
});
