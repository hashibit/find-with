/**
 * Integration test: QuotaService against a real PostgreSQL DB.
 *
 * Exercises what unit mocks cannot:
 *   - The UNIQUE constraint on quota_consume_logs.tailoredResumeId
 *     enforces idempotency at the DB level.
 *   - The transaction that atomically increments the counter and
 *     writes the log either completes fully or not at all.
 */
import { DataSource, Repository } from 'typeorm';
import { ForbiddenException } from '@nestjs/common';
import { beforeAll, afterAll, beforeEach, afterEach, describe, it, expect } from 'vitest';
import { QuotaService } from '../../src/contexts/quota/quota.service.js';
import { QuotaUsageCounter } from '../../src/database/entities/quota/quota-counter.entity.js';
import { QuotaConsumeLog } from '../../src/database/entities/quota/quota-log.entity.js';
import { ALL_ENTITIES } from '../../src/database/database.module.js';

let ds: DataSource;
let counterRepo: Repository<QuotaUsageCounter>;
let logRepo: Repository<QuotaConsumeLog>;
let service: QuotaService;

const USER = 'int_test_user_quota';

beforeAll(async () => {
  ds = new DataSource({
    type: 'postgres',
    url: process.env.DATABASE_URL,
    entities: ALL_ENTITIES,
    synchronize: false,
    logging: false,
  });
  await ds.initialize();
  counterRepo = ds.getRepository(QuotaUsageCounter);
  logRepo = ds.getRepository(QuotaConsumeLog);
  service = new QuotaService(counterRepo, logRepo);
});

afterAll(async () => {
  await ds.destroy();
});

beforeEach(async () => {
  // Clean up any state from a previous run
  await logRepo.delete({ userId: USER });
  await counterRepo.delete({ userId: USER });
});

afterEach(async () => {
  await logRepo.delete({ userId: USER });
  await counterRepo.delete({ userId: USER });
});

describe('QuotaService — integration', () => {
  describe('getRemaining', () => {
    it('creates a counter row on first access', async () => {
      const remaining = await service.getRemaining(USER);
      expect(remaining).toBe(3); // default free limit
      const row = await counterRepo.findOne({ where: { userId: USER } });
      expect(row).not.toBeNull();
      expect(row!.tailoringCompleted).toBe(0);
    });
  });

  describe('consumeOnExport', () => {
    it('increments counter and writes log', async () => {
      await service.consumeOnExport(USER, 'resume_int_01');
      const counter = await counterRepo.findOne({ where: { userId: USER } });
      const log = await logRepo.findOne({ where: { tailoredResumeId: 'resume_int_01' } });
      expect(counter!.tailoringCompleted).toBe(1);
      expect(log).not.toBeNull();
    });

    it('is idempotent — second call is a no-op enforced by DB UNIQUE constraint', async () => {
      await service.consumeOnExport(USER, 'resume_int_02');
      await service.consumeOnExport(USER, 'resume_int_02'); // should not throw or double-charge
      const counter = await counterRepo.findOne({ where: { userId: USER } });
      const logs = await logRepo.find({ where: { userId: USER } });
      expect(counter!.tailoringCompleted).toBe(1); // charged once
      expect(logs).toHaveLength(1); // one log entry
    });

    it('throws ForbiddenException when quota is exhausted', async () => {
      // Exhaust quota manually
      await counterRepo.save(
        counterRepo.create({ userId: USER, tailoringCompleted: 3, tailoringLimit: 3 }),
      );
      await expect(service.consumeOnExport(USER, 'resume_int_03')).rejects.toThrow(
        ForbiddenException,
      );
      // Counter should not have been incremented
      const counter = await counterRepo.findOne({ where: { userId: USER } });
      expect(counter!.tailoringCompleted).toBe(3);
    });

    it('allows export after pro upgrade (limit raised to 999999)', async () => {
      await counterRepo.save(
        counterRepo.create({ userId: USER, tailoringCompleted: 3, tailoringLimit: 3 }),
      );
      await service.setProLimit(USER);
      await expect(service.consumeOnExport(USER, 'resume_int_04')).resolves.not.toThrow();
    });
  });
});
