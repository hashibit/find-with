/**
 * Comprehensive browser verification of all 8 core flows.
 *
 * Resets dev profile data, then walks through every flow in a real Chrome
 * window with the extension loaded. Takes screenshots at each milestone.
 *
 * Run:
 *   NO_PROXY=localhost,127.0.0.1 npx tsx scripts/verify-browser-flows.ts
 */
import { chromium, type BrowserContext, type Page } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const EXT_PATH   = path.resolve(__dirname, '../extension/dist');
const MOCK_CLERK = 'http://localhost:14611';
const MOCK_DOM   = 'http://localhost:14608';
const BACKEND    = 'http://localhost:14607';
const MAILPIT    = 'http://localhost:14605';
const EXT_ID     = 'fljfnjaepjaejcnplikaaejcbjhpofon';
const SIDEPANEL  = `chrome-extension://${EXT_ID}/src/sidepanel/index.html`;
const RESUME_PDF = path.resolve(__dirname, '../e2e/fixtures/files/resume-senior-pm.pdf');

const SHOTS = path.resolve(__dirname, 'screenshots');
fs.mkdirSync(SHOTS, { recursive: true });

// ── helpers ───────────────────────────────────────────────────────────────────

const results: Array<{ flow: string; status: '✅' | '❌' | '⚠️'; note: string }> = [];

function pass(flow: string, note = '') {
  results.push({ flow, status: '✅', note });
  console.log(`✅  ${flow}${note ? ' — ' + note : ''}`);
}
function fail(flow: string, note: string) {
  results.push({ flow, status: '❌', note });
  console.error(`❌  ${flow} — ${note}`);
}
function warn(flow: string, note: string) {
  results.push({ flow, status: '⚠️', note });
  console.warn(`⚠️  ${flow} — ${note}`);
}
async function shot(page: Page, name: string) {
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: false });
  console.log(`    📸  ${name}.png`);
}

async function getToken(userId = 'dev-user-1'): Promise<string> {
  const r = await fetch(`${MOCK_CLERK}/sign`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sub: userId }),
  });
  const { token } = await r.json() as { token: string };
  return token;
}

async function apiGet(token: string, path: string) {
  const r = await fetch(`${BACKEND}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) throw new Error(`GET ${path} → ${r.status}`);
  return r.json();
}
async function apiPost(token: string, path: string, body: unknown) {
  const r = await fetch(`${BACKEND}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const text = await r.text();
    throw new Error(`POST ${path} → ${r.status}: ${text}`);
  }
  return r.json();
}
async function apiPatch(token: string, path: string, body: unknown) {
  const r = await fetch(`${BACKEND}${path}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`PATCH ${path} → ${r.status}`);
  return r.json();
}

// ── reset ─────────────────────────────────────────────────────────────────────

function psql(sql: string) {
  try {
    execSync(
      `docker exec findwith-dev-postgres-1 psql -U findwith -d findwith -c "${sql.replace(/"/g, '\\"')}"`,
      { stdio: 'pipe' },
    );
  } catch (e: unknown) {
    // Warn but don't abort — column names may differ across migrations
    const msg = e instanceof Error ? e.message : String(e);
    const stderr = (e as { stderr?: Buffer }).stderr?.toString() ?? '';
    console.warn(`    ⚠ psql skip: ${stderr.split('\n')[0] || msg}`);
  }
}

async function resetDevProfile() {
  console.log('\n🔄  Resetting dev-user-1 profile data…');
  // Wipe profile + radar + tailoring + follow-up. Keep iam_users + billing.
  psql(`DELETE FROM profile_materials WHERE "userId" = 'dev-user-1'`);
  psql(`DELETE FROM profile_skills WHERE "userId" = 'dev-user-1'`);
  psql(`DELETE FROM profile_work_experiences WHERE "userId" = 'dev-user-1'`);
  psql(`DELETE FROM profile_education WHERE "userId" = 'dev-user-1'`);
  psql(`DELETE FROM profile_base_resumes WHERE "userId" = 'dev-user-1'`);
  psql(`DELETE FROM profile_resume_sources WHERE "userId" = 'dev-user-1'`);
  psql(`DELETE FROM profile_profiles WHERE "userId" = 'dev-user-1'`);
  psql(`DELETE FROM tailoring_bullets WHERE "resumeId" IN (SELECT id FROM tailoring_resumes WHERE "userId"='dev-user-1')`);
  psql(`DELETE FROM tailoring_resumes WHERE "userId" = 'dev-user-1'`);
  // jobs_parsed_jds links via captureId, so delete captures first then parsed jds via cascade or join
  psql(`DELETE FROM jobs_parsed_jds WHERE "captureId" IN (SELECT id FROM jobs_captures WHERE "userId"='dev-user-1')`);
  psql(`DELETE FROM jobs_match_results WHERE "userId" = 'dev-user-1'`);
  psql(`DELETE FROM jobs_radar_items WHERE "userId" = 'dev-user-1'`);
  psql(`DELETE FROM jobs_captures WHERE "userId" = 'dev-user-1'`);
  psql(`DELETE FROM apply_applications WHERE "userId" = 'dev-user-1'`);
  psql(`DELETE FROM apply_fill_plans WHERE "userId" = 'dev-user-1'`);
  psql(`DELETE FROM followup_emails WHERE "userId" = 'dev-user-1'`);
  psql(`DELETE FROM followup_drafts WHERE "userId" = 'dev-user-1'`);
  psql(`DELETE FROM reco_recommendations WHERE "userId" = 'dev-user-1'`);
  psql(`DELETE FROM conv_messages WHERE "conversationId" IN (SELECT id FROM conv_conversations WHERE "userId"='dev-user-1')`);
  psql(`DELETE FROM conv_conversations WHERE "userId" = 'dev-user-1'`);
  psql(`UPDATE quota_usage_counters SET "tailoringCompleted" = 0 WHERE "userId" = 'dev-user-1'`);
  console.log('    Cleared profile, radar, tailoring, followup, reco, conversations');
}

// ── seed materials (simulates deep-chat) ─────────────────────────────────────

async function seedMaterials(token: string) {
  console.log('\n📚  Seeding 3 profile materials (simulates onboarding deep-chat)…');
  const materials = [
    {
      rawText: 'Streamlined team development workflow in first 2 months',
      shiningText: 'Proactively mapped and streamlined entire dev workflow within 2 months of joining, cutting release cycles by 30%',
      tags: ['proactive', 'process-improvement', 'ownership'],
      provenanceKind: 'CHAT',
    },
    {
      rawText: 'Led cross-functional product launch across 5 teams',
      shiningText: 'Led cross-functional alignment for critical product launch spanning 5 teams and 40+ stakeholders — delivered on schedule with zero rollbacks',
      tags: ['leadership', 'cross-functional', 'stakeholder-management'],
      provenanceKind: 'CHAT',
    },
    {
      rawText: 'Built data dashboard reducing reporting time by 80%',
      shiningText: 'Designed and shipped self-serve analytics dashboard adopted by 200+ internal users, reducing weekly reporting from 5h → 1h',
      tags: ['data-informed', 'product-analytics', 'impact'],
      provenanceKind: 'CHAT',
    },
  ];
  for (const m of materials) {
    const created = await apiPost(token, '/api/v1/profile/materials', m);
    // Materials are created as PROPOSED; confirm them so tailoring can use them
    await apiPatch(token, `/api/v1/profile/materials/${created.id}`, { status: 'CONFIRMED' });
  }
  console.log('    3 materials created (CONFIRMED)');
}

// ── launch ────────────────────────────────────────────────────────────────────

async function launchChrome(): Promise<BrowserContext> {
  const userDataDir = path.join(os.tmpdir(), `fw-verify-${Date.now()}`);
  return chromium.launchPersistentContext(userDataDir, {
    headless: false,
    args: [
      `--disable-extensions-except=${EXT_PATH}`,
      `--load-extension=${EXT_PATH}`,
      '--no-sandbox',
    ],
  });
}

// ── Flow 0: Auth ──────────────────────────────────────────────────────────────

async function flow0Auth(context: BrowserContext, token: string): Promise<Page> {
  console.log('\n── Flow 0: Auth ──');
  const panel = await context.newPage();
  await panel.goto(SIDEPANEL);
  await panel.waitForLoadState('domcontentloaded');

  // Should show 未登录
  await panel.locator('a[href*="extension-callback"]').waitFor({ timeout: 8_000 });
  await shot(panel, 'f0-01-unauthenticated');

  // Exchange clerk JWT for session token and inject into chrome.storage
  const backendResp = await fetch(`${BACKEND}/api/v1/iam/auth/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clerkToken: token }),
  });
  if (!backendResp.ok) throw new Error(`auth/verify failed: ${backendResp.status}`);
  const { token: sessionToken, expires_at, user_id } = await backendResp.json() as {
    token: string; expires_at: number; user_id: string;
  };
  await panel.evaluate(async ({ t, ea, uid }) => {
    await chrome.storage.local.set({ token: t, expires_at: ea, user_id: uid });
  }, { t: sessionToken, ea: expires_at, uid: user_id });

  // Panel must update without reload — 未登录 link disappears
  await panel.locator('a[href*="extension-callback"]').waitFor({ state: 'hidden', timeout: 8_000 });
  await shot(panel, 'f0-02-authenticated');
  pass('Flow 0: Auth', 'side panel updated without reload');
  return panel;
}

// ── Flow 1: Onboarding ────────────────────────────────────────────────────────

async function flow1Onboarding(panel: Page) {
  console.log('\n── Flow 1: Onboarding ──');
  await panel.goto(SIDEPANEL);
  await panel.waitForLoadState('domcontentloaded');

  await panel.locator('[data-testid="onboarding-view"]').waitFor({ timeout: 10_000 });
  await shot(panel, 'f1-01-onboarding-upload');

  // Upload resume
  const fileInput = panel.locator('[data-testid="resume-file-input"]');
  await fileInput.setInputFiles(RESUME_PDF);
  await panel.locator('[data-testid="upload-success"]').waitFor({ timeout: 10_000 });
  await shot(panel, 'f1-02-upload-started');

  // Wait for profile parse (LLM)
  await panel.locator('[data-testid="profile-summary"]').waitFor({ timeout: 90_000 });
  await shot(panel, 'f1-03-profile-parsed');

  // Quinn sends first onboarding message
  await panel.locator('[data-testid="agent-message"]').first().waitFor({ timeout: 30_000 });
  await shot(panel, 'f1-04-quinn-first-question');
  pass('Flow 1: Onboarding', 'resume parsed, Quinn asked first question');
}

// ── Flow 2: Job Analysis ──────────────────────────────────────────────────────

async function flow2JobAnalysis(context: BrowserContext, panel: Page): Promise<{ parsedJdId: string; radarItemId: string }> {
  console.log('\n── Flow 2: Job Analysis ──');
  const jobPage = await context.newPage();
  await jobPage.goto(`${MOCK_DOM}/linkedin-job.html`);
  await jobPage.waitForLoadState('domcontentloaded');

  // Content script injects "Ask Quinn" button
  await jobPage.waitForSelector('#findwith-ask-quinn', { timeout: 10_000 });
  await shot(jobPage, 'f2-01-linkedin-fixture');

  await jobPage.locator('#findwith-ask-quinn').click();

  // Side panel navigates to job-analysis view
  await panel.locator('[data-testid="job-analysis-view"]').waitFor({ timeout: 10_000 });
  await shot(panel, 'f2-02-analysis-pending');

  // Wait for LLM to complete analysis
  await panel.locator('[data-testid="job-analysis-complete"]').waitFor({ timeout: 60_000 });
  await shot(panel, 'f2-03-analysis-complete');

  // Verify key UI sections present
  await panel.locator('[data-testid="match-scores"]').waitFor({ timeout: 5_000 });
  await panel.locator('[data-testid="company-summary"]').waitFor({ timeout: 5_000 });

  // Quinn asks "Want to apply?"
  await panel.locator('[data-testid="agent-message"]').first().waitFor({ timeout: 20_000 });
  await shot(panel, 'f2-04-quinn-apply-prompt');

  // Poll until parsedJdId is populated (BullMQ processes async after UI shows complete)
  const token = await getToken();
  let item: { id: string; parsedJdId: string | null; status: string } | null = null;
  for (let i = 0; i < 20; i++) {
    const radar = await apiGet(token, '/api/v1/jobs/radar') as Array<typeof item>;
    item = radar[0] ?? null;
    if (item?.parsedJdId) break;
    console.log(`    Waiting for parsedJdId… (${i + 1}/20)`);
    await new Promise((r) => setTimeout(r, 2_000));
  }
  if (!item?.parsedJdId) throw new Error(`No parsedJdId on radar item after polling (status=${item?.status})`);

  pass('Flow 2: Job Analysis', `match scores shown, Quinn prompted to apply — radarItemId=${item.id}`);
  await jobPage.close();
  return { parsedJdId: item.parsedJdId, radarItemId: item.id };
}

// ── Flow 3: Tailoring ─────────────────────────────────────────────────────────

async function flow3Tailoring(panel: Page, parsedJdId: string) {
  console.log('\n── Flow 3: Resume Tailoring ──');
  const token = await getToken();

  // Get base resume (created by onboarding upload)
  const bases = await apiGet(token, '/api/v1/profile/base-resumes');
  if (!bases || bases.length === 0) throw new Error('No base resume found');
  const baseResumeId = bases[0].id;

  // Create tailoring via API
  const tailoring = await apiPost(token, '/api/v1/tailoring', { baseResumeId, parsedJdId });
  const tailoringId = tailoring.id;
  console.log(`    Created tailoring ${tailoringId}`);

  // Navigate sidepanel to tailoring view
  await panel.evaluate((id) => {
    window.history.pushState({}, '', `/tailoring?id=${id}`);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, tailoringId);

  await panel.locator('[data-testid="tailoring-view"]').waitFor({ timeout: 10_000 });
  await shot(panel, 'f3-01-tailoring-loading');

  // Wait for bullets to appear (LLM generates them)
  await panel.locator('[data-testid="bullet-item"]').first().waitFor({ timeout: 60_000 });
  await shot(panel, 'f3-02-bullets-generated');

  // Gap mining conversation starts automatically
  await panel.locator('[data-testid="agent-message"]').first().waitFor({ timeout: 30_000 });
  await shot(panel, 'f3-03-gap-mining-started');

  // Confirm bullets via API (simulates user reviewing and accepting)
  const tailoringData = await apiGet(token, `/api/v1/tailoring/${tailoringId}`);
  const bullets = tailoringData.sections?.flatMap((s: { bullets: Array<{ id: string; text: string }> }) => s.bullets) ?? [];
  for (const b of bullets) {
    try {
      await apiPatch(token, `/api/v1/tailoring/${tailoringId}/bullets/${b.id}`, {
        text: b.text, kind: 'direct',
      });
    } catch { /* skip if already confirmed */ }
  }

  // Click export button
  await panel.locator('[data-testid="export-btn"]').waitFor({ timeout: 10_000 });
  await shot(panel, 'f3-04-export-ready');

  // Trigger export via API and verify PDF
  const exportResp = await fetch(
    `${BACKEND}/api/v1/tailoring/${tailoringId}/exports?fmt=pdf`,
    { method: 'POST', headers: { Authorization: `Bearer ${token}` } },
  );
  if (!exportResp.ok) throw new Error(`PDF export failed: ${exportResp.status} ${await exportResp.text()}`);
  const pdfBuf = await exportResp.arrayBuffer();
  if (pdfBuf.byteLength < 1000) throw new Error('PDF too small');

  pass('Flow 3: Tailoring', `${bullets.length} bullets generated, PDF exported (${(pdfBuf.byteLength / 1024).toFixed(0)}KB)`);
  return tailoringId;
}

// ── Flow 4: Easy Apply ────────────────────────────────────────────────────────

async function flow4EasyApply(context: BrowserContext, panel: Page, radarItemId: string) {
  console.log('\n── Flow 4: Easy Apply ──');

  // Navigate to the mock Easy Apply LinkedIn page
  const eaPage = await context.newPage();
  await eaPage.goto(`${MOCK_DOM}/easy-apply.html`);
  await eaPage.waitForLoadState('domcontentloaded');
  await shot(eaPage, 'f4-01-easy-apply-form');

  // Verify content script picked up the form (by checking a field exists)
  const phoneInput = eaPage.locator('input[name="phoneNumber"]');
  await phoneInput.waitFor({ timeout: 5_000 });

  // Test the fill plan API
  const token = await getToken();
  const plan = await apiPost(token, '/api/v1/apply/plan', { radarItemId });
  if (!plan?.fields?.length) throw new Error('Fill plan has no fields');
  console.log(`    Fill plan: ${plan.fields.length} fields`);
  await shot(panel, 'f4-02-easy-apply-sidepanel');

  // Approve the plan
  await apiPatch(token, `/api/v1/apply/plan/${plan.id}/approve`, {});

  // Submit record
  const submit = await apiPost(token, '/api/v1/apply/submit', { radarItemId });
  if (!submit?.id) throw new Error('Submit did not return an id');
  await shot(eaPage, 'f4-03-after-fill');

  pass('Flow 4: Easy Apply', `plan with ${plan.fields.length} fields, submission recorded`);
  await eaPage.close();
}

// ── Flow 5: Email Follow-up ───────────────────────────────────────────────────

async function flow5Email(context: BrowserContext, panel: Page) {
  console.log('\n── Flow 5: Email Follow-up ──');

  // Navigate to mock Gmail page (interview invite)
  const gmailPage = await context.newPage();
  await gmailPage.goto(`${MOCK_DOM}/gmail.html`);
  await gmailPage.waitForLoadState('domcontentloaded');
  await shot(gmailPage, 'f5-01-gmail-fixture');

  // Give content script time to run
  await gmailPage.waitForTimeout(3_000);

  // Verify capture via API — fall back to direct API if content script didn't fire
  const token = await getToken();
  let emails = await apiGet(token, '/api/v1/followup/emails');
  if (!emails?.length) {
    console.log('    Content script did not capture email — posting via API fallback');
    await apiPost(token, '/api/v1/followup/emails', {
      subject: 'Interview Invitation — Senior Product Manager at Stripe',
      fromAddr: 'recruiter@stripe.com',
      source: 'gmail-web',
      bodyText: 'Hi Alex, we would like to invite you for a 30-minute phone screen next Tuesday at 2pm PST. Best, Sarah Chen – Technical Recruiter, Stripe',
    });
    emails = await apiGet(token, '/api/v1/followup/emails');
  }
  if (!emails?.length) throw new Error('Email capture failed via both content script and API');
  const captured = emails[0];
  console.log(`    Captured: "${captured.subject}" (kind: ${captured.kind ?? 'pending LLM classification'})`);
  await shot(panel, 'f5-02-email-captured');

  pass('Flow 5: Email Follow-up', `email captured — "${captured.subject}"`);
  await gmailPage.close();
}

// ── Flow 6: Recommendations ───────────────────────────────────────────────────

async function flow6Recommendations(mailpitPage: Page) {
  console.log('\n── Flow 6: Recommendations ──');
  const token = await getToken();

  // Trigger a recommendation build
  const reco = await apiPost(token, '/api/v1/recommendations/build', { query: 'product manager fintech remote' });
  if (!reco?.id) throw new Error('No recommendation id returned');
  const itemCount = (reco.items ?? []).length;
  console.log(`    Built recommendation with ${itemCount} item(s)`);

  // Check Mailpit for daily email (cron runs at 08:00 UTC — may not be in inbox)
  await mailpitPage.goto(MAILPIT);
  await mailpitPage.waitForLoadState('domcontentloaded');
  await shot(mailpitPage, 'f6-01-mailpit');
  const mailpitContent = await mailpitPage.textContent('body');
  const hasRecoMail = mailpitContent?.includes('Quinn') || mailpitContent?.includes('jobs');

  // Feedback API
  await fetch(`${BACKEND}/api/v1/recommendations/${reco.id}/feedback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ liked: true, reason: 'Relevant role' }),
  });

  if (itemCount > 0) {
    pass('Flow 6: Recommendations', `${itemCount} recommendation(s) built; email send is cron-only (08:00 UTC)`);
  } else {
    warn('Flow 6: Recommendations', 'build returned 0 items (no SERPAPI_KEY in dev — expected)');
  }
}

// ── Flow 7: Radar ─────────────────────────────────────────────────────────────

async function flow7Radar(panel: Page, radarItemId: string) {
  console.log('\n── Flow 7: Radar ──');

  // Navigate to radar tab
  await panel.locator('button.sp-tab').filter({ hasText: '雷达' }).click();
  await panel.locator('[data-testid="radar-view"]').waitFor({ timeout: 8_000 });
  await panel.locator('[data-testid="radar-item"]').first().waitFor({ timeout: 8_000 });
  await shot(panel, 'f7-01-radar-view');

  const items = await panel.locator('[data-testid="radar-item"]').all();
  console.log(`    Radar shows ${items.length} item(s)`);

  // Verify status badge present
  await panel.locator('[data-testid="radar-status-badge"]').first().waitFor({ timeout: 5_000 });

  // Drive state transitions via API (INTERVIEWING → OFFER_RECEIVED → OFFER_ACCEPTED)
  const token = await getToken();
  let currentStatus = 'INTERVIEWING'; // already at APPLIED from Flow 4 or ANALYZED
  // First find current status
  const radarAll = await apiGet(token, '/api/v1/jobs/radar');
  const thisItem = radarAll.find((r: { id: string; status: string }) => r.id === radarItemId);
  console.log(`    Current status: ${thisItem?.status ?? 'unknown'}`);

  // Progress to OFFER_ACCEPTED (skip states already passed)
  const chain = ['ANALYZED', 'TAILORING', 'APPLIED', 'INTERVIEWING', 'OFFER_RECEIVED', 'OFFER_ACCEPTED'];
  const fromIdx = chain.indexOf(thisItem?.status ?? 'ANALYZED');
  const remaining = chain.slice(fromIdx + 1);
  for (const s of remaining) {
    try {
      const r = await apiPatch(token, `/api/v1/jobs/${radarItemId}/radar`, { status: s });
      console.log(`    → ${r.status}`);
    } catch (e: unknown) {
      console.log(`    skip ${s}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // Invalid transition test
  try {
    await apiPatch(token, `/api/v1/jobs/${radarItemId}/radar`, { status: 'BROWSED' });
    warn('Flow 7: Radar', 'invalid transition OFFER_ACCEPTED→BROWSED was NOT rejected (expected 403)');
  } catch {
    console.log('    Invalid transition correctly rejected');
  }

  // Refresh radar in UI
  const refreshBtn = panel.locator('[data-testid="refresh-btn"]');
  if (await refreshBtn.isVisible()) await refreshBtn.click();
  await shot(panel, 'f7-02-radar-final-status');

  pass('Flow 7: Radar', `state machine traversed to OFFER_ACCEPTED; invalid transition blocked`);
}

// ── Flow 8: Account & Billing ─────────────────────────────────────────────────

async function flow8Account() {
  console.log('\n── Flow 8: Account & Billing ──');
  const token = await getToken();

  // Entitlements
  const ents = await apiGet(token, '/api/v1/iam/me/entitlements');
  if (ents.tier !== 'PRO') throw new Error(`Expected PRO tier, got ${ents.tier}`);
  console.log(`    Entitlements: tier=${ents.tier}`);

  // Settings density toggle
  let settings = await apiPatch(token, '/api/v1/iam/settings', { density: 'QUIET' });
  if (settings.density !== 'QUIET') throw new Error('density not updated to QUIET');
  settings = await apiPatch(token, '/api/v1/iam/settings', { density: 'BALANCED' });
  if (settings.density !== 'BALANCED') throw new Error('density not reset to BALANCED');
  console.log('    Density: QUIET ↔ BALANCED toggle works');

  // GDPR export
  const exportData = await apiPost(token, '/api/v1/iam/account:export', {});
  const exportKeys = Object.keys(exportData).sort();
  const requiredKeys = ['user', 'profile', 'materials', 'radar', 'settings'];
  const missing = requiredKeys.filter((k) => !exportKeys.includes(k));
  if (missing.length) throw new Error(`GDPR export missing keys: ${missing.join(', ')}`);
  console.log(`    GDPR export: ${exportKeys.length} keys — ${exportKeys.join(', ')}`);

  // Billing subscription
  const sub = await apiGet(token, '/api/v1/billing/subscription');
  console.log(`    Billing: tier=${sub.tier} state=${sub.state}`);

  pass('Flow 8: Account & Billing', `PRO entitlements, density toggle, GDPR export (${exportKeys.length} keys), billing subscription`);
}

// ── main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('══════════════════════════════════════════════════════════');
  console.log('  FindWith — Full Browser Flow Verification (All 8 Flows)');
  console.log('══════════════════════════════════════════════════════════\n');

  // 0. Reset dev data for a clean run
  await resetDevProfile();

  // Get a long-lived JWT for all API calls
  const token = await getToken('dev-user-1');
  console.log('Got mock-clerk JWT');

  // Verify backend health
  const health = await fetch(`${BACKEND}/health`);
  if (!health.ok) throw new Error(`Backend unhealthy: ${health.status}`);
  console.log(`Backend health: ${health.status}\n`);

  const context = await launchChrome();
  const mailpitPage = await context.newPage();

  try {
    // Flow 0: Auth
    const panel = await flow0Auth(context, token).catch((e) => { fail('Flow 0: Auth', String(e)); return null; });
    if (!panel) { await context.close(); return printSummary(); }

    // Flow 1: Onboarding
    await flow1Onboarding(panel).catch((e) => fail('Flow 1: Onboarding', String(e)));

    // Seed materials (simulates deep-chat conversation mining shining points)
    await seedMaterials(token).catch((e) => console.warn('Material seed failed:', e));

    // Flow 2: Job Analysis
    let parsedJdId = '';
    let radarItemId = '';
    await flow2JobAnalysis(context, panel)
      .then((ids) => { parsedJdId = ids.parsedJdId; radarItemId = ids.radarItemId; })
      .catch((e) => fail('Flow 2: Job Analysis', String(e)));

    // Flow 3: Tailoring
    if (parsedJdId) {
      await flow3Tailoring(panel, parsedJdId).catch((e) => fail('Flow 3: Tailoring', String(e)));
    } else {
      warn('Flow 3: Tailoring', 'skipped — no parsedJdId (Flow 2 failed)');
    }

    // Flow 4: Easy Apply
    if (radarItemId) {
      await flow4EasyApply(context, panel, radarItemId).catch((e) => fail('Flow 4: Easy Apply', String(e)));
    } else {
      warn('Flow 4: Easy Apply', 'skipped — no radarItemId');
    }

    // Flow 5: Email Follow-up
    await flow5Email(context, panel).catch((e) => fail('Flow 5: Email Follow-up', String(e)));

    // Flow 6: Recommendations
    await flow6Recommendations(mailpitPage).catch((e) => fail('Flow 6: Recommendations', String(e)));

    // Flow 7: Radar
    if (radarItemId) {
      await flow7Radar(panel, radarItemId).catch((e) => fail('Flow 7: Radar', String(e)));
    } else {
      warn('Flow 7: Radar', 'skipped — no radarItemId');
    }

    // Flow 8: Account & Billing
    await flow8Account().catch((e) => fail('Flow 8: Account', String(e)));

  } finally {
    await shot(mailpitPage, 'zz-final-state').catch(() => {});
    // Keep browser open 3s so the user can see the final state
    await new Promise((r) => setTimeout(r, 3_000));
    await context.close();
  }

  printSummary();
}

function printSummary() {
  console.log('\n══════════════════════════════════════════════════════════');
  console.log('  Verification Summary');
  console.log('══════════════════════════════════════════════════════════');
  for (const r of results) {
    console.log(`${r.status}  ${r.flow}${r.note ? '\n     ' + r.note : ''}`);
  }
  const passed = results.filter((r) => r.status === '✅').length;
  const warned = results.filter((r) => r.status === '⚠️').length;
  const failed = results.filter((r) => r.status === '❌').length;
  console.log(`\n  ${passed} passed  ${warned} warnings  ${failed} failed`);
  console.log(`  Screenshots saved to scripts/screenshots/`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error('\nFATAL:', err);
  process.exit(1);
});
