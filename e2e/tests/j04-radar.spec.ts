/**
 * J-04: Radar Status Progression
 *
 * Uses the seeded radar item (job-1, status=APPLIED).
 * Verifies cards render, status badges update, and DB reflects changes.
 */
import { test, expect } from '../fixtures/extension.js';
import {
  waitForElement,
  injectAuthToken,
  getSidePanelPage,
  apiCall,
  E2E_USER_ID,
} from '../helpers/sidepanel.js';
import { getRadarItem, resetRadarItemStatus } from '../helpers/db.js';

test.describe('J-04: Radar Status Progression', () => {
  test.beforeEach(async () => {
    // Reset job-1 back to APPLIED before each test
    await resetRadarItemStatus('job-1', 'APPLIED');
  });

  test('renders radar cards, updates status to INTERVIEWING, then REJECTED', async ({ context }) => {
    const sidepanel = await getSidePanelPage(context);
    await injectAuthToken(sidepanel, E2E_USER_ID);

    // Navigate to radar tab
    await sidepanel.evaluate(() => {
      window.history.pushState({}, '', '/radar');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });

    // Step 1-3: GET /v1/jobs/radar — radar view renders
    await waitForElement(sidepanel, '[data-testid="radar-view"]');
    await waitForElement(sidepanel, '[data-testid="radar-item"]', 10_000);

    // Step 3: Job cards rendered
    const items = sidepanel.locator('[data-testid="radar-item"]');
    await expect(items.first()).toBeVisible();

    // Step 4: Status badges match DB values
    const seededItem = sidepanel.locator('[data-testid="radar-item"][data-item-id="job-1"]');
    await expect(seededItem).toBeVisible();
    const badge = seededItem.locator('[data-testid="radar-status-badge"]');
    await expect(badge).toBeVisible();
    // Use data-status attribute for language-independent assertions
    await expect(badge).toHaveAttribute('data-status', 'applied');

    // Step 7: PATCH status to INTERVIEWING via API
    const patchRes = await apiCall('PATCH', '/jobs/job-1/radar', { status: 'INTERVIEWING' });
    expect(patchRes.status).toBe(200);

    // Refresh radar
    await sidepanel.locator('[data-testid="refresh-btn"]').click();
    await waitForElement(sidepanel, '[data-testid="radar-item"]', 10_000);

    // Step 8: Badge updates to INTERVIEWING
    const updatedItem = sidepanel.locator('[data-testid="radar-item"][data-item-id="job-1"]');
    const updatedBadge = updatedItem.locator('[data-testid="radar-status-badge"]');
    await expect(updatedBadge).toHaveAttribute('data-status', 'interview');

    // Step 9-10: Mark as rejected via API
    const rejectRes = await apiCall('PATCH', '/jobs/job-1/radar', { status: 'REJECTED' });
    expect(rejectRes.status).toBe(200);

    // Step 11: DB state = REJECTED
    const dbItem = await getRadarItem('job-1');
    expect(dbItem?.status).toBe('REJECTED');

    // Step 12: Refresh UI and verify rejected state
    await sidepanel.locator('[data-testid="refresh-btn"]').click();
    const rejectedBadge2 = sidepanel.locator('[data-testid="radar-item"][data-item-id="job-1"] [data-testid="radar-status-badge"]');
    await expect(rejectedBadge2).toHaveAttribute('data-status', 'rejected', { timeout: 15_000 });
  });
});
