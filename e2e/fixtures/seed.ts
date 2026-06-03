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
  process.env.DATABASE_URL || 'postgresql://e2e:e2e@localhost:5434/findwith_e2e';

const NOW = new Date().toISOString();
const FUTURE = new Date(Date.now() + 30 * 86_400_000).toISOString();
const THREE_DAYS_AGO = new Date(Date.now() - 3 * 86_400_000).toISOString();

export async function seed() {
  const client = new Client({ connectionString: DB_URL });
  await client.connect();

  try {
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
        'http://localhost:8081/linkedin-job-senior-pm.html',
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
