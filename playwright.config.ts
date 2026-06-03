import { defineConfig } from '@playwright/test';
import path from 'path';

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
    // Side Panel API requires headful Chrome.
    // In CI: xvfb-action provides a virtual display (DISPLAY=:99).
    // '--headless=new' does NOT expose chrome.sidePanel — do not use it.
    headless: false,
    channel: 'chromium',
    launchOptions: {
      args: [
        `--load-extension=${path.resolve('extension/dist-e2e')}`,
        `--disable-extensions-except=${path.resolve('extension/dist-e2e')}`,
        '--no-sandbox',
        '--disable-setuid-sandbox',
      ],
    },
    baseURL: 'http://localhost:14667',
  },
  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',
});
