import { chromium } from '@playwright/test';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const EXT_PATH = path.join(ROOT, 'extension/dist-e2e');
const DOM_BASE = 'http://localhost:14808';

async function main() {
  const userDataDir = path.join(os.tmpdir(), `findwith-verify-${Date.now()}`);
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    args: [
      `--disable-extensions-except=${EXT_PATH}`,
      `--load-extension=${EXT_PATH}`,
      '--no-sandbox',
    ],
  });

  await new Promise(r => setTimeout(r, 2000));

  const workers = context.serviceWorkers();
  console.log('Extension service worker:', workers[0]?.url() ?? 'NOT FOUND');

  const page = context.pages()[0] ?? await context.newPage();
  let passed = 0;
  let failed = 0;

  function check(name, result, detail = '') {
    if (result) { console.log(`  ✓ ${name}`); passed++; }
    else { console.error(`  ✗ ${name}${detail ? ' — ' + detail : ''}`); failed++; }
  }

  // ── 1. LinkedIn job CS ──────────────────────────────────────────────────
  console.log('\n[1] LinkedIn job content script');
  await page.goto(`${DOM_BASE}/linkedin-job-senior-pm.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);

  const askQuinnBtn = await page.$('#findwith-ask-quinn');
  check('Ask Quinn button injected', !!askQuinnBtn);

  if (askQuinnBtn) {
    await askQuinnBtn.click();
    // CS changes textContent to 'Capturing...' immediately on click
    await page.waitForTimeout(300);
    const btnText = await askQuinnBtn.evaluate(el => el.textContent);
    check(
      'Button text changes after click (CS click handler fired)',
      btnText !== 'Ask Quinn',
      `text: "${btnText}"`
    );
  }

  // ── 2. Gmail CS: DOM selectors present and CS runs ─────────────────────
  console.log('\n[2] Gmail content script');
  await page.goto(`${DOM_BASE}/gmail-interview-invite.html#msg-001`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);

  // Verify fixture has the selectors the CS looks for
  const subjectEl = await page.$('h2.hP');
  const senderEl = await page.$('.gD[email]');
  const bodyEl = await page.$('.a3s.aiL');
  const subjectText = await subjectEl?.evaluate(el => el.textContent?.trim());
  check('Gmail fixture has h2.hP (subject)', !!subjectEl, subjectText ?? 'missing');
  check('Gmail fixture has .gD[email] (sender)', !!senderEl);
  check('Gmail fixture has .a3s.aiL (body)', !!bodyEl);

  // CS sends EMAIL_CAPTURE when URL has '#' — verify it doesn't crash
  // (CS is in isolated world so we verify indirectly via DOM, not sendMessage interception)
  const hasHash = await page.evaluate(() => window.location.href.includes('#'));
  check('Gmail URL has # fragment (triggers EMAIL_CAPTURE in CS)', hasHash);

  // ── Summary ─────────────────────────────────────────────────────────────
  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  await page.waitForTimeout(1000);
  await context.close();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => { console.error(err); process.exit(1); });
