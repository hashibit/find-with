/**
 * J-06: Offer Farewell
 *
 * User accepts the offer at Stripe, farewell conversation is triggered
 * via the agent, and the radar item is updated to OFFER_ACCEPTED.
 *
 * NOTE (v0.1 gap): BillingSubscription.state is NOT asserted as 'PAUSED'
 * because no code path calls pauseSubscription on OFFER_ACCEPTED in v0.1.
 * See docs/tech/v0.1-e2e-plan.md §11 and §6 for details.
 */
import { test, expect } from '@playwright/test';
import {
  waitForElement,
  injectAuthToken,
  getSidePanelPage,
  apiCall,
  E2E_USER_ID,
} from '../helpers/sidepanel.js';
import { getRadarItem, resetRadarItemStatus } from '../helpers/db.js';

test.describe('J-06: Offer Farewell', () => {
  test.beforeEach(async () => {
    // Reset job-offer-1 to OFFER_RECEIVED before each run
    await resetRadarItemStatus('job-offer-1', 'OFFER_RECEIVED');
  });

  test('user accepts offer — farewell message shown, radar status = OFFER_ACCEPTED', async ({ context }) => {
    const sidepanel = await getSidePanelPage(context);
    await injectAuthToken(sidepanel, E2E_USER_ID);

    // Step 1: PATCH radar item to OFFER_ACCEPTED
    const patchRes = await apiCall('PATCH', '/jobs/job-offer-1/radar', { status: 'OFFER_ACCEPTED' });
    expect(patchRes.status).toBe(200);

    // Step 2-3: Create a FREE_CHAT conversation and send the farewell message
    const convRes = await apiCall('POST', '/conversations', { kind: 'FREE_CHAT' });
    expect(convRes.status).toBe(201);
    const conv = await convRes.json();
    const convId: string = conv.id;

    // Navigate sidepanel to conversation (ensure it exists in UI)
    await sidepanel.evaluate((id) => {
      // Store conversation ID for the view to pick up
      window.localStorage.setItem('activeConversationId', id);
    }, convId);

    // Send the farewell message via SSE prompt endpoint
    const promptRes = await fetch(`http://localhost:14667/api/v1/conversations/${convId}/prompt`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${E2E_USER_ID}`,
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      },
      body: JSON.stringify({ message: 'I accepted the offer at Stripe' }),
    });
    expect(promptRes.status).toBe(200);

    // Consume the SSE stream to completion
    const reader = promptRes.body?.getReader();
    if (reader) {
      let done = false;
      while (!done) {
        const chunk = await reader.read();
        done = chunk.done;
      }
    }

    // Step 4-5: Farewell message rendered in side panel
    // The conversation store should pick up the new message
    await waitForElement(sidepanel, '[data-testid="agent-message"]', 30_000);
    const farewell = sidepanel.locator('[data-testid="agent-message"]').last();
    await expect(farewell).toBeVisible();

    const farewellText = await farewell.textContent() ?? '';

    // Step 5: Farewell does NOT contain "!!" or emoji
    expect(farewellText).not.toContain('!!');
    expect(farewellText).not.toContain('🎉');

    // Step 6: Journey summary mentions something meaningful (not empty)
    expect(farewellText.length).toBeGreaterThan(30);

    // Step 7: DB — radar item status = OFFER_ACCEPTED
    const dbItem = await getRadarItem('job-offer-1');
    expect(dbItem?.status).toBe('OFFER_ACCEPTED');

    // Step 8: No active job-search UI elements visible (no onboarding or upload prompt)
    await expect(sidepanel.locator('[data-testid="upload-resume-btn"]')).not.toBeVisible();
  });
});
