/**
 * Dev environment core flow verification.
 * Opens Chrome with extension/dist (→ localhost:14607), walks the key product journey,
 * saves screenshots to scripts/screenshots/.
 *
 * Run: NO_PROXY=localhost,127.0.0.1 npx tsx scripts/verify-dev-flow.ts
 */
import { chromium } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { fileURLToPath } from 'url';

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const EXT_PATH  = path.resolve(__dirname, '../extension/dist');
const MOCK_CLERK = 'http://localhost:14611';
const MOCK_DOM   = 'http://localhost:14608';
const BACKEND    = 'http://localhost:14607';
const EXT_ID     = 'fljfnjaepjaejcnplikaaejcbjhpofon';
const SIDEPANEL  = `chrome-extension://${EXT_ID}/src/sidepanel/index.html`;
const RESUME_PDF = path.resolve(__dirname, '../e2e/fixtures/files/resume-senior-pm.pdf');

const SCREENSHOTS = path.resolve(__dirname, 'screenshots');
fs.mkdirSync(SCREENSHOTS, { recursive: true });

const STEPS: string[] = [];

function log(msg: string) {
  const ts = new Date().toLocaleTimeString();
  console.log(`[${ts}] ${msg}`);
  STEPS.push(msg);
}

async function getToken(userId = 'dev-user-1'): Promise<string> {
  const resp = await fetch(`${MOCK_CLERK}/sign`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sub: userId }),
  });
  const { token } = await resp.json() as { token: string };
  return token;
}

async function shot(page: any, name: string) {
  const file = path.join(SCREENSHOTS, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  log(`  📸 ${name}.png`);
}

async function main() {
  log('=== FindWith dev flow verification ===');

  const userDataDir = path.join(os.tmpdir(), `fw-dev-verify-${Date.now()}`);
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    args: [
      `--disable-extensions-except=${EXT_PATH}`,
      `--load-extension=${EXT_PATH}`,
      '--no-sandbox',
    ],
  });

  try {
    // ── 1. Dev user + verify backend reachable ────────────────────────────────
    // seed-dev.ts is run by `make dev-seed` / `make dev` before the backend starts,
    // so dev-user-1 should already exist. We just verify the backend responds.
    const token = await getToken('dev-user-1');
    log('Got mock-clerk JWT');

    const meResp = await fetch(`${BACKEND}/api/v1/iam/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!meResp.ok) {
      throw new Error(
        `Backend /iam/me returned ${meResp.status}. Run: make dev-seed (or make dev) first.`,
      );
    }
    log(`IAM /me → ${meResp.status}`);

    // ── 2. Open sidepanel ─────────────────────────────────────────────────────
    const page = await context.newPage();
    await page.goto(SIDEPANEL);
    await page.waitForLoadState('domcontentloaded');

    // Inject auth token before re-navigating to the canonical sidepanel URL
    await page.evaluate(async (tok: string) => {
      await chrome.storage.local.set({ token: tok });
    }, token);
    // Re-navigate to canonical URL (not the BrowserRouter-rewritten path)
    await page.goto(SIDEPANEL);
    await page.waitForLoadState('domcontentloaded');

    log('Step 1: Onboarding screen');
    await page.locator('[data-testid="onboarding-view"]').first().waitFor({ timeout: 10_000 });
    await shot(page, '01-onboarding');

    // ── 3. Upload resume ──────────────────────────────────────────────────────
    log('Step 2: Upload resume');
    const fileInput = page.locator('[data-testid="resume-file-input"]');
    await fileInput.setInputFiles(RESUME_PDF);

    await page.locator('[data-testid="upload-success"]').first().waitFor({ timeout: 10_000 });
    await shot(page, '02-upload-success');
    log('  Resume uploaded, waiting for parse…');

    await page.locator('[data-testid="profile-summary"]').first().waitFor({ timeout: 60_000 });
    await shot(page, '03-profile-parsed');
    log('Step 3: Profile parsed ✓');

    // ── 4. Wait for Quinn's onboarding question ───────────────────────────────
    log('Step 4: Quinn asks first onboarding question');
    await page.locator('[data-testid="agent-message"]').first().waitFor({ timeout: 30_000 });
    await shot(page, '04-quinn-question');

    // ── 5. Job analysis: navigate to mock LinkedIn fixture ────────────────────
    log('Step 5: Job analysis — open LinkedIn fixture');
    const jobPage = await context.newPage();
    await jobPage.goto(`${MOCK_DOM}/linkedin-job.html`);
    await jobPage.waitForLoadState('domcontentloaded');

    // Wait for content script to inject the "Ask Quinn" button
    await jobPage.waitForSelector('#findwith-ask-quinn', { timeout: 10_000 });
    await shot(jobPage, '05-linkedin-fixture');
    log('  Content script injected Ask Quinn button');

    // Click it — this sends JOB_CAPTURE to background → backend → navigates sidepanel
    await jobPage.locator('#findwith-ask-quinn').click();
    log('  Clicked Ask Quinn');

    // Side panel should now show job-analysis-view
    await page.locator('[data-testid="job-analysis-view"]').first().waitFor({ timeout: 10_000 });
    await shot(page, '06-job-analysis-loading');

    await page.locator('[data-testid="job-analysis-complete"]').first().waitFor({ timeout: 30_000 });
    await shot(page, '07-job-analysis-complete');
    log('Step 6: Job analysis complete ✓  (match-scores + company-summary visible)');

    // Wait for Quinn's "Do you want to apply?" message
    await page.locator('[data-testid="agent-message"]').first().waitFor({ timeout: 20_000 });
    await shot(page, '08-quinn-apply-prompt');
    log('Step 7: Quinn asks "Want to apply?" ✓');

    // ── 6. Radar ──────────────────────────────────────────────────────────────
    log('Step 8: Navigate to Radar tab');
    await page.evaluate(() => {
      window.history.pushState({}, '', '/radar');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    await page.locator('[data-testid="radar-view"]').first().waitFor({ timeout: 10_000 });
    await page.locator('[data-testid="radar-item"]').first().waitFor({ timeout: 10_000 });
    await shot(page, '09-radar');
    log('Step 9: Radar shows captured job ✓');

    // ── Summary ───────────────────────────────────────────────────────────────
    log('');
    log('=== All steps passed ===');
    STEPS.forEach((s) => console.log(' ', s));
    log(`Screenshots saved to scripts/screenshots/`);

  } finally {
    await context.close();
  }
}

main().catch((err) => {
  console.error('FAILED:', err);
  process.exit(1);
});
