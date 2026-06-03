/**
 * J-01: Onboarding (resume → profile)
 *
 * Fresh user e2e-user-onboard uploads a resume, Quinn parses it,
 * and the profile summary appears.
 */
import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';
import { waitForElement, injectAuthToken, getSidePanelPage, E2E_USER_ONBOARD } from '../helpers/sidepanel.js';
import { getMaterialsCount, getProfile } from '../helpers/db.js';

const RESUME_PDF = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../fixtures/files/resume-senior-pm.pdf',
);

test.describe('J-01: Onboarding', () => {
  test('upload resume, parse profile, start deep chat', async ({ context }) => {
    // Open the extension side panel page
    const sidepanel = await getSidePanelPage(context);

    // Inject auth token for fresh onboarding user
    await injectAuthToken(sidepanel, E2E_USER_ONBOARD);
    await sidepanel.reload();

    // Step 1-2: Onboarding view with upload prompt
    await waitForElement(sidepanel, '[data-testid="onboarding-view"]');
    await expect(sidepanel.locator('[data-testid="upload-resume-btn"]')).toBeVisible();

    // Step 3: Upload the resume PDF
    const fileInput = sidepanel.locator('[data-testid="resume-file-input"]');
    await fileInput.setInputFiles(RESUME_PDF);

    // Step 4-5: Parsing spinner / success message
    await waitForElement(sidepanel, '[data-testid="upload-success"]', 10_000);

    // Step 6: Profile summary appears (profile parsed)
    await waitForElement(sidepanel, '[data-testid="profile-summary"]', 30_000);
    await expect(sidepanel.locator('[data-testid="profile-summary"]')).toBeVisible();

    // Step 7: Quinn asks first deep-profile question via ConversationView
    await waitForElement(sidepanel, '[data-testid="agent-message"]', 20_000);

    // Step 8: Send a reply
    const input = sidepanel.locator('[data-testid="message-input"]');
    await input.fill('I led the redesign of checkout flow');
    await sidepanel.locator('[data-testid="send-btn"]').click();

    // Step 9: Quinn acknowledges
    await waitForElement(sidepanel, '[data-testid="agent-message"]:last-child', 20_000);
    const lastMsg = sidepanel.locator('[data-testid="agent-message"]').last();
    await expect(lastMsg).toBeVisible();

    // Step 10: DB assert — at least 1 material created
    const count = await getMaterialsCount(E2E_USER_ONBOARD);
    expect(count).toBeGreaterThanOrEqual(1);

    // Step 11: Click "Let's start" to exit onboarding
    await sidepanel.locator('[data-testid="lets-start-btn"]').click();

    // Step 12: Conversation view is default state
    await waitForElement(sidepanel, '[data-testid="conversation-view"]');
  });
});
