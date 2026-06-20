/**
 * Dev environment seed — idempotent, safe to re-run.
 * Creates a dev user, PRO subscription, and quota counter.
 *
 * Run: NO_PROXY=localhost,127.0.0.1 npx tsx scripts/seed-dev.ts
 * Or via Makefile:  make dev-seed
 */
import { Client } from 'pg';

const DB_URL =
  process.env.DATABASE_URL ?? 'postgresql://findwith:findwith_dev@localhost:14600/findwith';

async function main() {
  const client = new Client({ connectionString: DB_URL });
  await client.connect();
  try {
    const now = new Date().toISOString();

    await client.query(`
      INSERT INTO iam_users (id, "clerkUserId", email, "fullName", "isActive", "createdAt", "updatedAt")
      VALUES ('dev-user-1', 'dev-user-1', 'dev@findwith.test', 'Dev User', true, $1, $1)
      ON CONFLICT (id) DO NOTHING
    `, [now]);

    await client.query(`
      INSERT INTO billing_subscriptions (id, "userId", tier, state, "createdAt", "updatedAt")
      VALUES ('sub-dev-1', 'dev-user-1', 'PRO', 'ACTIVE', $1, $1)
      ON CONFLICT (id) DO NOTHING
    `, [now]);

    await client.query(`
      INSERT INTO quota_usage_counters ("userId", "tailoringCompleted", "tailoringLimit", "windowStart")
      VALUES ('dev-user-1', 0, 999, $1)
      ON CONFLICT ("userId") DO UPDATE SET "tailoringLimit" = 999
    `, [now]);

    console.log('[seed-dev] dev-user-1 ready');
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('[seed-dev] failed:', err.message);
  process.exit(1);
});
