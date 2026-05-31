/**
 * Integration test: TailoringService export path against a real PostgreSQL DB.
 *
 * Tests the two behaviors unit mocks cannot verify:
 *   1. PENDING bullet 422 guard — UnprocessableEntityException includes pendingBulletIds.
 *   2. Successful export — quota is consumed and the plain-text content is returned.
 *   3. Idempotent export — calling exportResume twice with the same id charges quota once.
 */
import { DataSource, Repository } from 'typeorm';
import { vi, beforeAll, afterAll, beforeEach, afterEach, describe, it, expect } from 'vitest';
import { UnprocessableEntityException } from '@nestjs/common';
import { TailoringService } from '../../src/contexts/tailoring/tailoring.service.js';
import { TailoringResume } from '../../src/database/entities/tailoring/tailoring-resume.entity.js';
import { TailoringSnapshot } from '../../src/database/entities/tailoring/tailoring-snapshot.entity.js';
import { QuotaService } from '../../src/contexts/quota/quota.service.js';
import { QuotaUsageCounter } from '../../src/database/entities/quota/quota-counter.entity.js';
import { QuotaConsumeLog } from '../../src/database/entities/quota/quota-log.entity.js';
import { ALL_ENTITIES } from '../../src/database/database.module.js';
import { ulid } from 'ulid';

const USER = 'int_test_user_tailoring_export';

// Queue is only used by TailoringService.start() — never called in export tests.
const mockQueue = { add: vi.fn() } as any;

let ds: DataSource;
let resumeRepo: Repository<TailoringResume>;
let snapshotRepo: Repository<TailoringSnapshot>;
let counterRepo: Repository<QuotaUsageCounter>;
let logRepo: Repository<QuotaConsumeLog>;
let service: TailoringService;

function makeSection(bullets: Array<{ id: string; text: string; status: string }>) {
  return [{ title: 'Work Experience', bullets }];
}

function makeBullet(status: string, id = ulid()): { id: string; text: string; status: string } {
  return { id, text: `Bullet text for ${id}`, status };
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

  resumeRepo = ds.getRepository(TailoringResume);
  snapshotRepo = ds.getRepository(TailoringSnapshot);
  counterRepo = ds.getRepository(QuotaUsageCounter);
  logRepo = ds.getRepository(QuotaConsumeLog);

  const quota = new QuotaService(counterRepo, logRepo);
  const mockMaterialRepo = { findOne: async () => null, find: async () => [] } as any;
  service = new TailoringService(resumeRepo, snapshotRepo, mockMaterialRepo, quota, mockQueue);
});

afterAll(async () => {
  await ds.destroy();
});

beforeEach(async () => {
  vi.clearAllMocks();
});

afterEach(async () => {
  await resumeRepo.delete({ userId: USER });
  await logRepo.delete({ userId: USER });
  await counterRepo.delete({ userId: USER });
});

describe('TailoringService.exportResume — integration', () => {
  describe('PENDING bullet guard', () => {
    it('throws 422 when all bullets are PENDING', async () => {
      const b1 = makeBullet('PENDING');
      const b2 = makeBullet('PENDING');
      const resume = await resumeRepo.save(
        resumeRepo.create({
          id: ulid(),
          userId: USER,
          baseResumeId: 'br_01',
          parsedJdId: 'jd_01',
          sections: makeSection([b1, b2]),
        }),
      );

      await expect(service.exportResume(USER, resume.id, 'txt')).rejects.toThrow(
        UnprocessableEntityException,
      );
    });

    it('includes the pending bullet IDs in the error response', async () => {
      const pendingId = ulid();
      const resume = await resumeRepo.save(
        resumeRepo.create({
          id: ulid(),
          userId: USER,
          baseResumeId: 'br_01',
          parsedJdId: 'jd_01',
          sections: makeSection([
            makeBullet('CONFIRMED'),
            makeBullet('PENDING', pendingId),
          ]),
        }),
      );

      let caught: UnprocessableEntityException | null = null;
      try {
        await service.exportResume(USER, resume.id, 'txt');
      } catch (e) {
        caught = e as UnprocessableEntityException;
      }

      expect(caught).not.toBeNull();
      const response = caught!.getResponse() as { pendingBulletIds: string[] };
      expect(response.pendingBulletIds).toEqual([pendingId]);
    });

    it('does not consume quota when the guard fires', async () => {
      const resume = await resumeRepo.save(
        resumeRepo.create({
          id: ulid(),
          userId: USER,
          baseResumeId: 'br_01',
          parsedJdId: 'jd_01',
          sections: makeSection([makeBullet('PENDING')]),
        }),
      );

      await expect(service.exportResume(USER, resume.id, 'txt')).rejects.toThrow(
        UnprocessableEntityException,
      );

      const counter = await counterRepo.findOne({ where: { userId: USER } });
      // Counter should either not exist or remain at 0 — no charge incurred
      expect(counter?.tailoringCompleted ?? 0).toBe(0);
    });
  });

  describe('successful export', () => {
    it('returns plain-text content built from section bullets', async () => {
      const resume = await resumeRepo.save(
        resumeRepo.create({
          id: ulid(),
          userId: USER,
          baseResumeId: 'br_01',
          parsedJdId: 'jd_01',
          sections: makeSection([
            makeBullet('CONFIRMED'),
            makeBullet('USER_EDITED'),
          ]),
        }),
      );

      const result = await service.exportResume(USER, resume.id, 'txt');
      expect(result.contentType).toBe('text/plain; charset=utf-8');
      expect(result.filename).toBe('resume.txt');
      expect(result.content).toContain('Work Experience');
      expect(result.content).toContain('• Bullet text for');
    });

    it('consumes quota on export', async () => {
      const resume = await resumeRepo.save(
        resumeRepo.create({
          id: ulid(),
          userId: USER,
          baseResumeId: 'br_01',
          parsedJdId: 'jd_01',
          sections: makeSection([makeBullet('CONFIRMED')]),
        }),
      );

      await service.exportResume(USER, resume.id, 'txt');

      const counter = await counterRepo.findOne({ where: { userId: USER } });
      expect(counter!.tailoringCompleted).toBe(1);
    });

    it('is idempotent — exporting the same resume twice charges quota once', async () => {
      const resume = await resumeRepo.save(
        resumeRepo.create({
          id: ulid(),
          userId: USER,
          baseResumeId: 'br_01',
          parsedJdId: 'jd_01',
          sections: makeSection([makeBullet('CONFIRMED')]),
        }),
      );

      await service.exportResume(USER, resume.id, 'txt');
      await service.exportResume(USER, resume.id, 'txt'); // retry — must not double-charge

      const counter = await counterRepo.findOne({ where: { userId: USER } });
      expect(counter!.tailoringCompleted).toBe(1);

      const logs = await logRepo.find({ where: { userId: USER } });
      expect(logs).toHaveLength(1);
    });

    it('fmt=pdf returns the same plain-text stub (no real PDF yet)', async () => {
      const resume = await resumeRepo.save(
        resumeRepo.create({
          id: ulid(),
          userId: USER,
          baseResumeId: 'br_01',
          parsedJdId: 'jd_01',
          sections: makeSection([makeBullet('CONFIRMED')]),
        }),
      );

      const result = await service.exportResume(USER, resume.id, 'pdf');
      // v0.1 stub: both formats return plain text
      expect(result.contentType).toBe('text/plain; charset=utf-8');
    });
  });

  describe('mixed bullet statuses', () => {
    it('passes when all bullets are CONFIRMED', async () => {
      const resume = await resumeRepo.save(
        resumeRepo.create({
          id: ulid(),
          userId: USER,
          baseResumeId: 'br_01',
          parsedJdId: 'jd_01',
          sections: makeSection([
            makeBullet('CONFIRMED'),
            makeBullet('CONFIRMED'),
            makeBullet('CONFIRMED'),
          ]),
        }),
      );
      await expect(service.exportResume(USER, resume.id, 'txt')).resolves.not.toThrow();
    });

    it('passes when bullets are CONFIRMED and USER_EDITED but not PENDING', async () => {
      const resume = await resumeRepo.save(
        resumeRepo.create({
          id: ulid(),
          userId: USER,
          baseResumeId: 'br_01',
          parsedJdId: 'jd_01',
          sections: makeSection([
            makeBullet('CONFIRMED'),
            makeBullet('USER_EDITED'),
          ]),
        }),
      );
      await expect(service.exportResume(USER, resume.id, 'txt')).resolves.not.toThrow();
    });

    it('blocks when even one bullet is PENDING among CONFIRMED bullets', async () => {
      const pendingId = ulid();
      const resume = await resumeRepo.save(
        resumeRepo.create({
          id: ulid(),
          userId: USER,
          baseResumeId: 'br_01',
          parsedJdId: 'jd_01',
          sections: makeSection([
            makeBullet('CONFIRMED'),
            makeBullet('CONFIRMED'),
            makeBullet('PENDING', pendingId),
          ]),
        }),
      );

      let caught: UnprocessableEntityException | null = null;
      try {
        await service.exportResume(USER, resume.id, 'txt');
      } catch (e) {
        caught = e as UnprocessableEntityException;
      }

      expect(caught).not.toBeNull();
      const response = caught!.getResponse() as { pendingBulletIds: string[] };
      expect(response.pendingBulletIds).toContain(pendingId);
      expect(response.pendingBulletIds).toHaveLength(1);
    });
  });
});
