/**
 * J-01: Onboarding (resume → profile)
 *
 * Fresh user e2e-user-onboard uploads a resume, Quinn parses it,
 * and the profile summary appears.
 */
import { test, expect } from '../fixtures/extension.js';
import path from 'path';
import { waitForElement, injectAuthToken, getSidePanelPage, SIDEPANEL_URL, E2E_USER_ONBOARD } from '../helpers/sidepanel.js';
import { getMaterialsCount } from '../helpers/db.js';

// Playwright runs from repo root with testDir: 'e2e/tests'
// process.cwd() = repo root, fixtures are at e2e/fixtures/files
const RESUME_PDF = path.resolve(process.cwd(), 'e2e/fixtures/files/resume-senior-pm.pdf');

test.describe('J-01: Onboarding', () => {
  test('upload resume, parse profile, start deep chat', async ({ context }) => {
    // Open the extension side panel page
    const sidepanel = await getSidePanelPage(context);

    // Inject auth token for fresh onboarding user, then reload from the canonical
    // extension URL (avoid ERR_FILE_NOT_FOUND caused by BrowserRouter rewriting
    // the URL to /chat before the reload).
    await injectAuthToken(sidepanel, E2E_USER_ONBOARD);
    await sidepanel.goto(SIDEPANEL_URL);
    await sidepanel.waitForLoadState('domcontentloaded');

    // Step 1-2: Chat view with upload prompt (onboarding lives inside the chat route)
    await waitForElement(sidepanel, '[data-testid="chat-view"]');
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

    // Step 9: Quinn acknowledges (wait for second agent-message; :last-child never
    // matches because ConversationView always has a messagesEnd sentinel div after it)
    await sidepanel.locator('[data-testid="agent-message"]').nth(1).waitFor({ state: 'visible', timeout: 20_000 });
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
