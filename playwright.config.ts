import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e/tests',
  timeout: 60_000,
  expect: { timeout: 30_000 },
  retries: process.env.CI ? 1 : 0,
  workers: 1, // Extension tests cannot run in parallel (shared Chrome profile)
  reporter: [
    ['list'],
    ['html', { outputFolder: 'e2e/playwright-report', open: 'never' }],
  ],
  use: {
    // The extension context is provided by e2e/fixtures/extension.ts which uses
    // chromium.launchPersistentContext — the Playwright-recommended approach for
    // Chrome extension testing. launchOptions are defined there, not here.
    baseURL: 'http://localhost:14667',
    screenshot: 'only-on-failure',
  },
  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',
});
