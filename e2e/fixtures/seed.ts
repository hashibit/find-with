/**
 * E2E seed data — runs against the e2e Postgres instance before tests.
 *
 * Inserts:
 *   - 3 IAM users
 *   - billing subscriptions
 *   - profile + materials + base resume for e2e-user-1
 *   - job radar items (for J-04 and J-06)
 */
import { Client } from 'pg';

const DB_URL =
  process.env.DATABASE_URL || 'postgresql://e2e:e2e@localhost:14800/findwith_e2e';

const NOW = new Date().toISOString();
const FUTURE = new Date(Date.now() + 30 * 86_400_000).toISOString();
const THREE_DAYS_AGO = new Date(Date.now() - 3 * 86_400_000).toISOString();

export async function seed() {
  const client = new Client({ connectionString: DB_URL });
  await client.connect();

  try {
    // ── Clean up e2e-user-onboard from previous runs ──────────────────────────
    // j01 (onboarding) uploads a real resume for this user; subsequent runs
    // would see stale profile data and skip the upload card.
    await client.query(`DELETE FROM conv_messages WHERE "conversationId" IN (SELECT id FROM conv_conversations WHERE "userId" = 'e2e-user-onboard')`);
    await client.query(`DELETE FROM conv_conversations WHERE "userId" = 'e2e-user-onboard'`);
    await client.query(`DELETE FROM profile_materials WHERE "userId" = 'e2e-user-onboard'`);
    await client.query(`DELETE FROM profile_base_resumes WHERE "userId" = 'e2e-user-onboard'`);
    await client.query(`DELETE FROM profile_skills WHERE "userId" = 'e2e-user-onboard'`);
    await client.query(`DELETE FROM profile_projects WHERE "userId" = 'e2e-user-onboard'`);
    await client.query(`DELETE FROM profile_work_experiences WHERE "userId" = 'e2e-user-onboard'`);
    await client.query(`DELETE FROM profile_education WHERE "userId" = 'e2e-user-onboard'`);
    await client.query(`DELETE FROM profile_resume_sources WHERE "userId" = 'e2e-user-onboard'`);
    await client.query(`DELETE FROM profile_profiles WHERE "userId" = 'e2e-user-onboard'`);

    // ── IAM users ────────────────────────────────────────────────────────────
    await client.query(`
      INSERT INTO iam_users (id, "clerkUserId", email, "fullName", "isActive", "createdAt", "updatedAt")
      VALUES
        ('e2e-user-1',       'e2e-user-1',       'user1@e2e.test',    'Alex Johnson', true, $1, $1),
        ('e2e-user-onboard', 'e2e-user-onboard', 'onboard@e2e.test',  'New User',     true, $1, $1),
        ('e2e-user-free',    'e2e-user-free',    'free@e2e.test',     'Free User',    true, $1, $1)
      ON CONFLICT (id) DO NOTHING
    `, [NOW]);

    // ── Billing subscriptions ─────────────────────────────────────────────────
    await client.query(`
      INSERT INTO billing_subscriptions (id, "userId", tier, state, "periodEnd", "createdAt", "updatedAt")
      VALUES
        ('sub-e2e-1',       'e2e-user-1',       'PRO',  'ACTIVE', $1, $2, $2),
        ('sub-e2e-onboard', 'e2e-user-onboard', 'FREE', 'ACTIVE', $1, $2, $2),
        ('sub-e2e-free',    'e2e-user-free',    'FREE', 'ACTIVE', $1, $2, $2)
      ON CONFLICT (id) DO NOTHING
    `, [FUTURE, NOW]);

    // ── Profile for e2e-user-1 ─────────────────────────────────────────────
    // profile_profiles PK = "userId" (UserOwnedSingletonEntity)
    await client.query(`
      INSERT INTO profile_profiles ("userId", "basicInfo", certifications, "createdAt", "updatedAt")
      VALUES (
        'e2e-user-1',
        $1::jsonb,
        '[]'::jsonb,
        $2, $2
      )
      ON CONFLICT ("userId") DO NOTHING
    `, [
      JSON.stringify({
        fullName: 'Alex Johnson',
        email: 'alex.johnson@email.com',
        phone: '+1-415-555-0101',
        location: 'San Francisco, CA',
        linkedinUrl: 'https://linkedin.com/in/alexjohnson',
      }),
      NOW,
    ]);

    // ── Materials for e2e-user-1 ──────────────────────────────────────────────
    await client.query(`
      INSERT INTO profile_materials
        (id, "userId", "shiningText", rationale, tags, "provenanceKind", status, "createdAt", "updatedAt")
      VALUES
        ('mat-1', 'e2e-user-1',
          'Streamlined onboarding process cutting time-to-first-value by 40%',
          'Shows process ownership and measurable impact',
          '["ownership","process","impact"]'::jsonb,
          'resume', 'CONFIRMED', $1, $1),
        ('mat-2', 'e2e-user-1',
          'Led 5-team cross-functional sprint that shipped payments v2 on time',
          'Demonstrates cross-functional leadership at scale',
          '["cross-functional","leadership","payments"]'::jsonb,
          'resume', 'CONFIRMED', $1, $1),
        ('mat-3', 'e2e-user-1',
          'Defined KPI framework adopted by 3 product teams',
          'Data-driven decision making, org-level influence',
          '["data-driven","kpi","influence"]'::jsonb,
          'resume', 'CONFIRMED', $1, $1)
      ON CONFLICT (id) DO NOTHING
    `, [NOW]);

    // ── Base resume for e2e-user-1 ────────────────────────────────────────────
    await client.query(`
      INSERT INTO profile_base_resumes
        (id, "userId", name, "selectedMaterialIds", "isDefault", "createdAt", "updatedAt")
      VALUES (
        'base-resume-e2e-1',
        'e2e-user-1',
        'PM track',
        '["mat-1","mat-2","mat-3"]'::jsonb,
        true,
        $1, $1
      )
      ON CONFLICT (id) DO NOTHING
    `, [NOW]);

    // ── Job capture ───────────────────────────────────────────────────────────
    await client.query(`
      INSERT INTO jobs_captures
        (id, "userId", source, "sourceUrl", "capturedText", "capturedAt", "createdAt", "updatedAt")
      VALUES (
        'capture-e2e-1',
        'e2e-user-1',
        'linkedin',
        'http://localhost:14808/linkedin-job-senior-pm.html',
        'Senior Product Manager at Acme Corp — 5+ years PM experience, B2B SaaS...',
        $1, $1, $1
      )
      ON CONFLICT (id) DO NOTHING
    `, [NOW]);

    // ── Parsed JD ─────────────────────────────────────────────────────────────
    await client.query(`
      INSERT INTO jobs_parsed_jds
        (id, "captureId", title, company, location,
         "hardSkills", "softSkills", "niceToHave", "hiddenSignals",
         "parsedAt", "createdAt", "updatedAt")
      VALUES (
        'pjd-e2e-1',
        'capture-e2e-1',
        'Senior Product Manager',
        'Acme Corp',
        'San Francisco, CA (Hybrid)',
        '["SQL","A/B testing","Product roadmap","Stakeholder management","B2B SaaS"]'::jsonb,
        '["Cross-functional leadership","Communication","Analytical thinking"]'::jsonb,
        '["Payments/fintech","Amplitude","MBA"]'::jsonb,
        '["Large org with multiple engineering squads"]'::jsonb,
        $1, $1, $1
      )
      ON CONFLICT (id) DO NOTHING
    `, [NOW]);

    // ── Radar items ───────────────────────────────────────────────────────────
    // J-04: APPLIED, 3 days ago (for status progression and followup tests)
    await client.query(`
      INSERT INTO jobs_radar_items
        (id, "userId", "captureId", "parsedJdId", status, "lastStatusAt", "createdAt", "updatedAt")
      VALUES (
        'job-1',
        'e2e-user-1',
        'capture-e2e-1',
        'pjd-e2e-1',
        'APPLIED',
        $1,
        $2, $2
      )
      ON CONFLICT (id) DO NOTHING
    `, [THREE_DAYS_AGO, NOW]);

    // J-06: OFFER_RECEIVED (farewell tool target)
    await client.query(`
      INSERT INTO jobs_radar_items
        (id, "userId", "captureId", "parsedJdId", status, "lastStatusAt", "createdAt", "updatedAt")
      VALUES (
        'job-offer-1',
        'e2e-user-1',
        'capture-e2e-1',
        'pjd-e2e-1',
        'OFFER_RECEIVED',
        $1, $1, $1
      )
      ON CONFLICT (id) DO NOTHING
    `, [NOW]);

    // ── Quota counter — PRO users get unlimited tailoring ─────────────────────
    // Reset on every seed run so previous test runs don't exhaust the quota.
    await client.query(`
      INSERT INTO quota_usage_counters ("userId", "tailoringCompleted", "tailoringLimit", "windowStart")
      VALUES ('e2e-user-1', 0, 999999, $1)
      ON CONFLICT ("userId") DO UPDATE
        SET "tailoringCompleted" = 0,
            "tailoringLimit"     = 999999,
            "windowStart"        = $1
    `, [NOW]);

    // Clear any consume-log entries from previous runs (UNIQUE on tailoredResumeId)
    await client.query(`DELETE FROM quota_consume_log WHERE "userId" = 'e2e-user-1'`);

    // ── Recommendation for e2e-user-1 (needed for j08) ───────────────────────
    await client.query(`
      INSERT INTO reco_recommendations (id, "userId", items, "sentAt", "createdAt", "updatedAt")
      VALUES (
        'reco-e2e-1',
        'e2e-user-1',
        '[{"id":"item-1","title":"Senior PM at Stripe","company":"Stripe","location":"Remote","url":"https://linkedin.com/jobs/1","snippet":"5+ years PM","source":"linkedin"},{"id":"item-2","title":"Product Lead at Linear","company":"Linear","location":"SF","url":"https://linkedin.com/jobs/2","snippet":"B2B SaaS PM","source":"linkedin"}]'::jsonb,
        NULL,
        $1, $1
      ) ON CONFLICT (id) DO NOTHING
    `, [NOW]);

    // ── Rejection email for e2e-user-1 (needed for j11) ──────────────────────
    await client.query(`
      INSERT INTO followup_emails (id, "userId", "radarItemId", subject, "fromAddr", kind, parsed, "createdAt", "updatedAt")
      VALUES (
        'email-rejection-1',
        'e2e-user-1',
        'job-1',
        'Your application to DataCo',
        'noreply@dataco.com',
        'REJECTION',
        '{"keyInfo":{},"summary":"Unfortunately not moving forward"}'::jsonb,
        $1, $1
      ) ON CONFLICT (id) DO NOTHING
    `, [NOW]);

    // ── Tailoring record with PENDING bullets for e2e-user-1 (needed for j10) ──
    // Pre-seeded so j10 can test the PENDING-bullet export guard without racing the queue processor.
    await client.query(`
      INSERT INTO tailoring_resumes (id, "userId", "baseResumeId", "parsedJdId", "matchBefore", "matchAfter", "createdAt", "updatedAt")
      VALUES (
        'tailoring-pending-e2e-1',
        'e2e-user-1',
        'base-resume-e2e-1',
        'pjd-e2e-1',
        0.65,
        NULL,
        $1, $1
      ) ON CONFLICT (id) DO NOTHING
    `, [NOW]);
    await client.query(`
      INSERT INTO tailoring_bullets (id, "resumeId", "sectionTitle", position, text, source, "sourceId", status, "createdAt", "updatedAt")
      VALUES (
        'b-pending-e2e-1',
        'tailoring-pending-e2e-1',
        'Work Experience',
        0,
        '',
        'MATERIAL',
        NULL,
        'PENDING',
        $1, $1
      ) ON CONFLICT (id) DO NOTHING
    `, [NOW]);

    // ── Free-tier quota at limit for e2e-user-free (needed for j07 billing test) ──
    await client.query(`
      INSERT INTO quota_usage_counters ("userId", "tailoringCompleted", "tailoringLimit", "windowStart")
      VALUES ('e2e-user-free', 3, 3, $1)
      ON CONFLICT ("userId") DO UPDATE
        SET "tailoringCompleted" = 3,
            "tailoringLimit"     = 3,
            "windowStart"        = $1
    `, [NOW]);

    console.log('[seed] E2E fixture data seeded successfully');
  } finally {
    await client.end();
  }
}

// Allow direct execution
if (process.argv[1]?.endsWith('seed.ts') || process.argv[1]?.endsWith('seed.js')) {
  seed().catch((err) => {
    console.error('[seed] Failed:', err);
    process.exit(1);
  });
}
