# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: j04-radar.spec.ts >> J-04: Radar Status Progression >> renders radar cards, updates status to INTERVIEWING, then REJECTED
- Location: e2e/tests/j04-radar.spec.ts:23:7

# Error details

```
Error: expect(received).toContain(expected) // indexOf

Expected substring: "appl"
Received string:    "已投递"
```

# Test source

```ts
  1  | /**
  2  |  * J-04: Radar Status Progression
  3  |  *
  4  |  * Uses the seeded radar item (job-1, status=APPLIED).
  5  |  * Verifies cards render, status badges update, and DB reflects changes.
  6  |  */
  7  | import { test, expect } from '../fixtures/extension.js';
  8  | import {
  9  |   waitForElement,
  10 |   injectAuthToken,
  11 |   getSidePanelPage,
  12 |   apiCall,
  13 |   E2E_USER_ID,
  14 | } from '../helpers/sidepanel.js';
  15 | import { getRadarItem, resetRadarItemStatus } from '../helpers/db.js';
  16 | 
  17 | test.describe('J-04: Radar Status Progression', () => {
  18 |   test.beforeEach(async () => {
  19 |     // Reset job-1 back to APPLIED before each test
  20 |     await resetRadarItemStatus('job-1', 'APPLIED');
  21 |   });
  22 | 
  23 |   test('renders radar cards, updates status to INTERVIEWING, then REJECTED', async ({ context }) => {
  24 |     const sidepanel = await getSidePanelPage(context);
  25 |     await injectAuthToken(sidepanel, E2E_USER_ID);
  26 | 
  27 |     // Navigate to radar tab
  28 |     await sidepanel.evaluate(() => {
  29 |       window.history.pushState({}, '', '/radar');
  30 |       window.dispatchEvent(new PopStateEvent('popstate'));
  31 |     });
  32 | 
  33 |     // Step 1-3: GET /v1/jobs/radar — radar view renders
  34 |     await waitForElement(sidepanel, '[data-testid="radar-view"]');
  35 |     await waitForElement(sidepanel, '[data-testid="radar-item"]', 10_000);
  36 | 
  37 |     // Step 3: Job cards rendered
  38 |     const items = sidepanel.locator('[data-testid="radar-item"]');
  39 |     await expect(items.first()).toBeVisible();
  40 | 
  41 |     // Step 4: Status badges match DB values
  42 |     const seededItem = sidepanel.locator('[data-testid="radar-item"][data-item-id="job-1"]');
  43 |     await expect(seededItem).toBeVisible();
  44 |     const badge = seededItem.locator('[data-testid="radar-status-badge"]');
  45 |     await expect(badge).toBeVisible();
  46 |     const badgeText = await badge.textContent();
  47 |     // The seeded item has status APPLIED — label maps to "Applied" in the component
> 48 |     expect(badgeText?.toLowerCase()).toContain('appl');
     |                                      ^ Error: expect(received).toContain(expected) // indexOf
  49 | 
  50 |     // Step 7: PATCH status to INTERVIEWING via API
  51 |     const patchRes = await apiCall('PATCH', '/jobs/job-1/radar', { status: 'INTERVIEWING' });
  52 |     expect(patchRes.status).toBe(200);
  53 | 
  54 |     // Refresh radar
  55 |     await sidepanel.locator('button:has-text("Refresh")').click();
  56 |     await waitForElement(sidepanel, '[data-testid="radar-item"]', 10_000);
  57 | 
  58 |     // Step 8: Badge updates to INTERVIEWING
  59 |     const updatedItem = sidepanel.locator('[data-testid="radar-item"][data-item-id="job-1"]');
  60 |     const updatedBadge = updatedItem.locator('[data-testid="radar-status-badge"]');
  61 |     const updatedText = await updatedBadge.textContent();
  62 |     expect(updatedText?.toLowerCase()).toContain('interview');
  63 | 
  64 |     // Step 9-10: Mark as rejected via API
  65 |     const rejectRes = await apiCall('PATCH', '/jobs/job-1/radar', { status: 'REJECTED' });
  66 |     expect(rejectRes.status).toBe(200);
  67 | 
  68 |     // Step 11: DB state = REJECTED
  69 |     const dbItem = await getRadarItem('job-1');
  70 |     expect(dbItem?.status).toBe('REJECTED');
  71 | 
  72 |     // Step 12: Refresh UI and verify rejected state
  73 |     await sidepanel.locator('button:has-text("Refresh")').click();
  74 |     // Wait for the badge text to update to "rejected" (not just for the element to be visible)
  75 |     const rejectedBadge2 = sidepanel.locator('[data-testid="radar-item"][data-item-id="job-1"] [data-testid="radar-status-badge"]');
  76 |     await expect(rejectedBadge2).toContainText(/rejected/i, { timeout: 15_000 });
  77 |   });
  78 | });
  79 | 
```