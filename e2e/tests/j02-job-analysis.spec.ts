/**
 * J-02: Job Analysis ("Ask Quinn")
 *
 * Navigate to a LinkedIn fixture page, click "Ask Quinn",
 * verify the three-layer match analysis renders correctly.
 */
import { test, expect } from '@playwright/test';
import {
  waitForElement,
  injectAuthToken,
  getSidePanelPage,
  navigateToFixture,
  apiCall,
  E2E_USER_ID,
  FIXTURES_URL,
} from '../helpers/sidepanel.js';
import { getRadarItem } from '../helpers/db.js';

test.describe('J-02: Job Analysis', () => {
  test('Ask Quinn button triggers analysis — shows company, match scores, gaps', async ({ context, page }) => {
    // Auth
    const sidepanel = await getSidePanelPage(context);
    await injectAuthToken(sidepanel, E2E_USER_ID);

    // Step 1: Navigate to LinkedIn fixture page
    await navigateToFixture(page, 'linkedin-job-senior-pm');

    // Step 2: Assert "Ask Quinn" button injected by content script
    await page.waitForSelector('#findwith-ask-quinn', { timeout: 10_000 });
    await expect(page.locator('#findwith-ask-quinn')).toBeVisible();

    // Step 3: Click "Ask Quinn"
    await page.locator('#findwith-ask-quinn').click();

    // Step 4: Side panel activates (job analysis view appears)
    await waitForElement(sidepanel, '[data-testid="job-analysis-view"]', 10_000);

    // Steps 5-8: Wait for analysis to complete
    await waitForElement(sidepanel, '[data-testid="job-analysis-complete"]', 30_000);

    // Step 9: Company summary visible
    await expect(sidepanel.locator('[data-testid="company-summary"]')).toBeVisible();

    // Step 10: Three-layer match rendered
    const matchScores = sidepanel.locator('[data-testid="match-scores"]');
    await expect(matchScores).toBeVisible();

    // Surface match: integer percent shown
    const surfaceText = await matchScores.locator('text=/%/').first().textContent();
    expect(surfaceText).toMatch(/\d+%/);

    // Gap list: at least 1 item
    const gapList = sidepanel.locator('[data-testid="gap-list"] li');
    await expect(gapList.first()).toBeVisible();

    // Step 11: Quinn asks "Do you want to apply?" via conversation
    const agentMsgs = sidepanel.locator('[data-testid="agent-message"]');
    await waitForElement(sidepanel, '[data-testid="agent-message"]', 20_000);
    const lastMsgText = await agentMsgs.last().textContent();
    expect(lastMsgText?.toLowerCase()).toContain('apply');

    // Step 12: DB — radar item created with status ANALYZED
    // (Give the backend a moment to write)
    await new Promise((r) => setTimeout(r, 2000));
    const radarList = await apiCall('GET', '/jobs/radar');
    const items: { status: string }[] = await radarList.json();
    const analyzed = items.find((i) => i.status === 'ANALYZED');
    expect(analyzed).toBeTruthy();
  });

  test('J-02b: Bad match — Quinn includes discouragement signal', async ({ context, page }) => {
    const sidepanel = await getSidePanelPage(context);
    await injectAuthToken(sidepanel, E2E_USER_ID);

    await navigateToFixture(page, 'linkedin-job-ds-mismatch');

    await page.waitForSelector('#findwith-ask-quinn', { timeout: 10_000 });
    await page.locator('#findwith-ask-quinn').click();

    await waitForElement(sidepanel, '[data-testid="job-analysis-complete"]', 30_000);
    await waitForElement(sidepanel, '[data-testid="agent-message"]', 20_000);

    const msgText = await sidepanel.locator('[data-testid="agent-message"]').last().textContent();
    // Quinn should signal it's a bad match (discourage language)
    const text = msgText?.toLowerCase() ?? '';
    const hasDiscouragement =
      text.includes("don't recommend") ||
      text.includes("not recommend") ||
      text.includes("poor match") ||
      text.includes("mismatch") ||
      text.includes("not suggest") ||
      text.includes("caution");
    expect(hasDiscouragement).toBe(true);
  });
});
