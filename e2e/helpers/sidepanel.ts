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
export const BACKEND_URL = 'http://localhost:14807';
export const FIXTURES_URL = 'http://localhost:14808';
export const MOCK_CLERK_URL = 'http://localhost:14811';

// Stable extension ID derived from e2e/extension-key.pem via e2e/manifest.e2e.json key field.
// If the PEM key changes, recompute: python3 -c "import json,hashlib,base64; ..."
const EXTENSION_ID = 'fljfnjaepjaejcnplikaaejcbjhpofon';
export const SIDEPANEL_URL = `chrome-extension://${EXTENSION_ID}/src/sidepanel/index.html`;

/**
 * Get a signed Clerk JWT from mock-clerk for the given user ID.
 * The backend verifies these JWTs via JWKS at mock-clerk.
 */
export async function getMockClerkToken(userId: string): Promise<string> {
  const resp = await fetch(`${MOCK_CLERK_URL}/sign`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sub: userId }),
  });
  if (!resp.ok) {
    throw new Error(`mock-clerk /sign failed: ${resp.status}`);
  }
  const data = (await resp.json()) as { token: string };
  return data.token;
}

/**
 * Wait for an element matching `selector` to become visible.
 * Uses Playwright's built-in `.waitFor` — no polling needed.
 */
export async function waitForElement(
  page: Page,
  selector: string,
  timeout = 30_000,
): Promise<void> {
  // Use .first() to avoid strict-mode violation when multiple elements match
  await page.locator(selector).first().waitFor({ state: 'visible', timeout });
}

/**
 * Inject auth token into extension storage for a given user.
 * Gets a signed Clerk JWT from mock-clerk and stores it.
 * Must be called on the extension side panel page (not the content page).
 */
export async function injectAuthToken(page: Page, userId: string): Promise<void> {
  const token = await getMockClerkToken(userId);
  // Key must match what extension/src/lib/auth.ts reads: chrome.storage.local.get(['token'])
  // Await the Promise so storage is committed before any page reload.
  await page.evaluate(async (tok) => {
    await chrome.storage.local.set({ token: tok });
  }, token);
}

/**
 * Open the extension side panel page and return it.
 *
 * Chrome opens the side panel only on icon click (openPanelOnActionClick: true),
 * which Playwright cannot trigger from the toolbar.
 * Solution: navigate directly to the side panel URL using the stable extension ID
 * derived from e2e/extension-key.pem (predictable, no service-worker discovery needed).
 */
export async function getSidePanelPage(context: BrowserContext): Promise<Page> {
  // Re-use existing side panel page if already open
  const existing = context.pages().find((p) => p.url().includes('sidepanel/index.html'));
  if (existing) return existing;

  const page = await context.newPage();
  await page.goto(SIDEPANEL_URL);
  await page.waitForLoadState('domcontentloaded');
  return page;
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
  const token = await getMockClerkToken(userId);
  return fetch(`${BACKEND_URL}/api/v1${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
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
  const token = await getMockClerkToken(userId);
  return fetch(`${BACKEND_URL}/api/v1/conversations/${conversationId}/prompt`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
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
