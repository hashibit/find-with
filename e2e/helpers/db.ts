/**
 * DB helpers for e2e tests — direct Postgres queries for state assertions.
 */
import { Client } from 'pg';

const DB_URL = process.env.DATABASE_URL || 'postgresql://e2e:e2e@localhost:5434/findwith_e2e';

export async function withDb<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: DB_URL });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

/** Get a radar item by ID. */
export async function getRadarItem(id: string) {
  return withDb(async (c) => {
    const { rows } = await c.query('SELECT * FROM jobs_radar_items WHERE id = $1', [id]);
    return rows[0] ?? null;
  });
}

/** Get materials count for a user. */
export async function getMaterialsCount(userId: string): Promise<number> {
  return withDb(async (c) => {
    const { rows } = await c.query(
      'SELECT COUNT(*) FROM profile_materials WHERE "userId" = $1',
      [userId],
    );
    return parseInt(rows[0].count, 10);
  });
}

/** Get profile for a user. */
export async function getProfile(userId: string) {
  return withDb(async (c) => {
    const { rows } = await c.query('SELECT * FROM profile_profiles WHERE "userId" = $1', [userId]);
    return rows[0] ?? null;
  });
}

/** Get billing subscription for a user. */
export async function getSubscription(userId: string) {
  return withDb(async (c) => {
    const { rows } = await c.query(
      'SELECT * FROM billing_subscriptions WHERE "userId" = $1',
      [userId],
    );
    return rows[0] ?? null;
  });
}

/** Get followup emails for a user. */
export async function getFollowupEmails(userId: string) {
  return withDb(async (c) => {
    const { rows } = await c.query(
      'SELECT * FROM followup_emails WHERE "userId" = $1 ORDER BY "createdAt" DESC',
      [userId],
    );
    return rows;
  });
}

/** Get followup drafts for a user. */
export async function getFollowupDrafts(userId: string) {
  return withDb(async (c) => {
    const { rows } = await c.query(
      'SELECT * FROM followup_drafts WHERE "userId" = $1 ORDER BY "createdAt" DESC',
      [userId],
    );
    return rows;
  });
}

/** Get tailoring resume by ID. */
export async function getTailoringResume(id: string) {
  return withDb(async (c) => {
    const { rows } = await c.query('SELECT * FROM tailoring_resumes WHERE id = $1', [id]);
    return rows[0] ?? null;
  });
}

/** Reset e2e user state between tests that modify shared data. */
export async function resetRadarItemStatus(id: string, status: string) {
  return withDb(async (c) => {
    await c.query(
      'UPDATE jobs_radar_items SET status = $1, "lastStatusAt" = NOW() WHERE id = $2',
      [status, id],
    );
  });
}
