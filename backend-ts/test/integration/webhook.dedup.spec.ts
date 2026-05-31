/**
 * Integration test: webhook event dedup via INSERT … ON CONFLICT DO NOTHING.
 *
 * Tests the DB-level idempotency constraint on iam_webhook_events directly —
 * the same logic used by InfraController.dedup(). The constraint is:
 *   UNIQUE(provider, event_id)
 *
 * First insert → rowCount 1 (new event, process it).
 * Duplicate insert → rowCount 0 (already processed, skip).
 */
import { DataSource, Repository } from 'typeorm';
import { beforeAll, afterAll, afterEach, describe, it, expect } from 'vitest';
import { IamWebhookEvent } from '../../src/database/entities/iam/webhook-event.entity.js';
import { ALL_ENTITIES } from '../../src/database/database.module.js';
import { ulid } from 'ulid';

let ds: DataSource;
let repo: Repository<IamWebhookEvent>;

/** Mirrors InfraController.dedup() — returns true if the event is new. */
async function dedup(provider: string, eventId: string, eventType: string): Promise<boolean> {
  const result = await repo
    .createQueryBuilder()
    .insert()
    .into(IamWebhookEvent)
    .values({ id: ulid(), provider, eventId, eventType })
    .orIgnore()
    .execute();
  return (result.raw?.rowCount ?? result.identifiers.length) > 0;
}

beforeAll(async () => {
  ds = new DataSource({
    type: 'postgres',
    url: process.env.DATABASE_URL,
    entities: ALL_ENTITIES,
    synchronize: false,
    logging: false,
  });
  await ds.initialize();
  repo = ds.getRepository(IamWebhookEvent);
});

afterAll(async () => {
  await ds.destroy();
});

afterEach(async () => {
  await repo.createQueryBuilder().delete().where('"eventId" LIKE :prefix', { prefix: 'evt_test_%' }).execute();
});

describe('webhook dedup — integration', () => {
  it('returns true for a new event', async () => {
    const isNew = await dedup('stripe', 'evt_test_001', 'customer.subscription.created');
    expect(isNew).toBe(true);
    const row = await repo.findOne({ where: { eventId: 'evt_test_001' } });
    expect(row).not.toBeNull();
    expect(row!.provider).toBe('stripe');
    expect(row!.eventType).toBe('customer.subscription.created');
  });

  it('returns false for a duplicate (provider + eventId) — second call is a no-op', async () => {
    await dedup('stripe', 'evt_test_002', 'invoice.payment_succeeded');
    const isNew = await dedup('stripe', 'evt_test_002', 'invoice.payment_succeeded');
    expect(isNew).toBe(false);

    // Only one row should exist in DB
    const rows = await repo.find({ where: { eventId: 'evt_test_002' } });
    expect(rows).toHaveLength(1);
  });

  it('treats same eventId from different providers as distinct events', async () => {
    const stripeNew = await dedup('stripe', 'evt_test_003', 'checkout.session.completed');
    const clerkNew = await dedup('clerk', 'evt_test_003', 'user.created');
    expect(stripeNew).toBe(true);
    expect(clerkNew).toBe(true);

    const rows = await repo.find({ where: { eventId: 'evt_test_003' } });
    expect(rows).toHaveLength(2);
  });

  it('allows a concurrent burst of the same event — exactly one wins', async () => {
    // Simulate 5 concurrent inserts of the same event
    const results = await Promise.all(
      Array.from({ length: 5 }, () => dedup('clerk', 'evt_test_004', 'user.deleted')),
    );
    const newCount = results.filter(Boolean).length;
    expect(newCount).toBe(1);

    const rows = await repo.find({ where: { eventId: 'evt_test_004' } });
    expect(rows).toHaveLength(1);
  });

  it('different eventIds under the same provider are all new', async () => {
    const ids = ['evt_test_010', 'evt_test_011', 'evt_test_012'];
    const results = await Promise.all(
      ids.map((id) => dedup('stripe', id, 'invoice.payment_failed')),
    );
    expect(results.every(Boolean)).toBe(true);

    for (const id of ids) {
      const row = await repo.findOne({ where: { eventId: id } });
      expect(row).not.toBeNull();
    }
  });
});
