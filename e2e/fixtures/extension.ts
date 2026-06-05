/**
 * Playwright fixture that provides a Chrome browser context with the
 * extension loaded via launchPersistentContext.
 *
 * This is the Playwright-documented approach for testing Chrome extensions:
 * https://playwright.dev/docs/chrome-extensions
 *
 * Import `test` and `expect` from this file instead of `@playwright/test`
 * in all e2e extension test files.
 */
import { test as base, chromium, expect, type BrowserContext } from '@playwright/test';
import path from 'path';
import os from 'os';

// Playwright runs from repo root with testDir: 'e2e/tests'
// process.cwd() = repo root, so extension is at extension/dist-e2e
const EXT_PATH = path.resolve(process.cwd(), 'extension/dist-e2e');

export { expect };

export const test = base.extend<{ context: BrowserContext }>({
  // Override the default `context` fixture to use launchPersistentContext,
  // which is required for Chrome extensions to load and for chrome-extension://
  // URL navigation to work.
  context: async ({}, use) => {
    // Use a temp directory for user data
    const userDataDir = path.join(os.tmpdir(), 'findwith-e2e-', Date.now().toString());
    const context = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      args: [
        `--disable-extensions-except=${EXT_PATH}`,
        `--load-extension=${EXT_PATH}`,
        '--no-sandbox',
        '--disable-setuid-sandbox',
      ],
    });
    await use(context);
    await context.close();
  },

  // Override `page` to return the first page in the context.
  page: async ({ context }, use) => {
    const page = context.pages()[0] ?? await context.newPage();
    await use(page);
  },
});
