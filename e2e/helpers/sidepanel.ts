/**
 * Side panel helpers for Playwright e2e tests.
 *
 * The extension side panel is a separate Chrome window/page from the content page.
 * To interact with it, find the page whose URL matches the extension's sidepanel HTML.
 */
import type { BrowserContext, Page } from '@playwright/test';
import { expect } from '@playwright/test';

export const E2E_USER_ID = 'e2e-user-1';
export const E2E_USER_ONBOARD = 'e2e-user-onboard';
export const E2E_USER_FREE = 'e2e-user-free';
export const BACKEND_URL = 'http://localhost:14667';
export const FIXTURES_URL = 'http://localhost:8081';

/**
 * Wait for an element matching `selector` to become visible.
 * Uses Playwright's built-in `.waitFor` — no polling needed.
 */
export async function waitForElement(
  page: Page,
  selector: string,
  timeout = 30_000,
): Promise<void> {
  await page.locator(selector).waitFor({ state: 'visible', timeout });
}

/**
 * Inject auth token into extension storage for a given user.
 * Must be called on the extension side panel page (not the content page).
 */
export async function injectAuthToken(page: Page, userId: string): Promise<void> {
  await page.evaluate((uid) => {
    chrome.storage.local.set({
      auth_token: uid,
      auth_expires_at: Math.floor(Date.now() / 1000) + 3600,
      user_id: uid,
    });
  }, userId);
}

/**
 * Find the extension side panel page in the context.
 * Side panel URL pattern: `chrome-extension://<id>/src/sidepanel/index.html`
 */
export async function getSidePanelPage(context: BrowserContext): Promise<Page> {
  // Give the extension a moment to register
  await new Promise((r) => setTimeout(r, 500));

  const pages = context.pages();
  const sidepanel = pages.find((p) => p.url().includes('sidepanel/index.html'));
  if (sidepanel) return sidepanel;

  // Wait for it to open
  return new Promise((resolve) => {
    context.on('page', (page) => {
      if (page.url().includes('sidepanel/index.html')) resolve(page);
    });
  });
}

/**
 * Make an authenticated API call from the test process directly.
 * Useful for setup / teardown steps that don't go through the extension.
 */
export async function apiCall(
  method: string,
  path: string,
  body?: unknown,
  userId = E2E_USER_ID,
): Promise<Response> {
  return fetch(`${BACKEND_URL}/api/v1${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${userId}`,
      'Content-Type': 'application/json',
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

/** Assert the SSE stream endpoint returns a 200 before DOM assertions. */
export async function triggerConversationPrompt(
  conversationId: string,
  message: string,
  userId = E2E_USER_ID,
): Promise<Response> {
  return fetch(`${BACKEND_URL}/api/v1/conversations/${conversationId}/prompt`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${userId}`,
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    },
    body: JSON.stringify({ message }),
  });
}

/** Navigate to a fixture DOM page and wait for content script to inject. */
export async function navigateToFixture(
  page: Page,
  fixture: 'linkedin-job-senior-pm' | 'linkedin-job-ds-mismatch' | 'gmail-interview-invite' | 'gmail-rejection' | 'gmail-hr-followup',
): Promise<void> {
  await page.goto(`${FIXTURES_URL}/${fixture}.html`);
  await page.waitForLoadState('domcontentloaded');
}
