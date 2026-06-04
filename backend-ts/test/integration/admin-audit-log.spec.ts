/**
 * Integration test: AuditLog entity persistence and index queries.
 *
 * Tests that the admin_audit_logs table was migrated correctly and that
 * the composite index (action, createdAt) and single index (targetId) are
 * functional at the query level.
 */
import { DataSource, Repository, MoreThan } from 'typeorm';
import { beforeAll, afterAll, afterEach, describe, it, expect } from 'vitest';
import { ALL_ENTITIES } from '../../src/database/database.module.js';
import { AuditLog } from '../../src/database/entities/admin/audit-log.entity.js';
import { ulid } from 'ulid';

let ds: DataSource;
let repo: Repository<AuditLog>;

const TEST_PREFIX = 'int_test_auditlog_';

beforeAll(async () => {
  ds = new DataSource({
    type: 'postgres',
    url: process.env.DATABASE_URL,
    entities: ALL_ENTITIES,
    synchronize: false,
    logging: false,
  });
  await ds.initialize();
  repo = ds.getRepository(AuditLog);
});

afterAll(async () => {
  await ds.destroy();
});

afterEach(async () => {
  await repo
    .createQueryBuilder()
    .delete()
    .where('"targetId" LIKE :prefix', { prefix: `${TEST_PREFIX}%` })
    .execute();
});

function makeLog(opts: { action?: string; targetId?: string; note?: string | null } = {}) {
  return repo.create({
    id: ulid(),
    action: opts.action ?? 'test-action',
    targetId: opts.targetId ?? `${TEST_PREFIX}${ulid()}`,
    note: opts.note ?? null,
  });
}

describe('AuditLog integration', () => {
  describe('basic persistence', () => {
    it('saves and retrieves a log entry', async () => {
      const log = makeLog({ action: 'test-save', targetId: `${TEST_PREFIX}u1` });
      await repo.save(log);

      const found = await repo.findOne({ where: { id: log.id } });
      expect(found).not.toBeNull();
      expect(found!.action).toBe('test-save');
      expect(found!.targetId).toBe(`${TEST_PREFIX}u1`);
    });

    it('allows null note', async () => {
      const log = makeLog({ note: null });
      await repo.save(log);
      const found = await repo.findOne({ where: { id: log.id } });
      expect(found!.note).toBeNull();
    });

    it('persists a non-null note', async () => {
      const log = makeLog({ note: 'saga abc reset' });
      await repo.save(log);
      const found = await repo.findOne({ where: { id: log.id } });
      expect(found!.note).toBe('saga abc reset');
    });
  });

  describe('query by targetId (single index)', () => {
    it('finds all logs for a given targetId', async () => {
      const tid = `${TEST_PREFIX}user_idx_test`;
      await repo.save([
        makeLog({ action: 'action-a', targetId: tid }),
        makeLog({ action: 'action-b', targetId: tid }),
      ]);

      const rows = await repo.find({ where: { targetId: tid } });
      expect(rows.length).toBe(2);
      expect(rows.map((r) => r.action).sort()).toEqual(['action-a', 'action-b']);
    });
  });

  describe('query by (action, createdAt) composite index', () => {
    it('filters by action + createdAt range', async () => {
      const before = new Date(Date.now() - 1000);
      await repo.save([
        makeLog({ action: 'retry-purge' }),
        makeLog({ action: 'retry-purge' }),
        makeLog({ action: 'other-action' }),
      ]);

      const rows = await repo.find({
        where: {
          action: 'retry-purge',
          createdAt: MoreThan(before),
        },
      });
      // Only the retry-purge entries created after `before`
      expect(rows.length).toBeGreaterThanOrEqual(2);
      expect(rows.every((r) => r.action === 'retry-purge')).toBe(true);
    });
  });

  describe('multiple entries for same action', () => {
    it('stores each entry independently', async () => {
      const logs = Array.from({ length: 5 }, () => makeLog({ action: 'bulk-test' }));
      await repo.save(logs);
      const ids = logs.map((l) => l.id);
      const found = await Promise.all(ids.map((id) => repo.findOne({ where: { id } })));
      expect(found.filter(Boolean).length).toBe(5);
    });
  });
});
