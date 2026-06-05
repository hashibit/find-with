import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { TailoringService } from '../../../src/contexts/tailoring/tailoring.service.js';
import { TailoringResume } from '../../../src/database/entities/tailoring/tailoring-resume.entity.js';
import { TailoringBullet, BulletStatus } from '../../../src/database/entities/tailoring/tailoring-bullet.entity.js';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const makeResume = (override: Partial<TailoringResume> = {}): TailoringResume =>
  ({
    id: 'tr_01',
    userId: 'user_01',
    baseResumeId: 'br_01',
    parsedJdId: 'jd_01',
    matchBefore: null,
    matchAfter: null,
    ...override,
  }) as TailoringResume;

const makeBullet = (override: Partial<TailoringBullet> = {}): TailoringBullet =>
  ({
    id: 'b_01',
    resumeId: 'tr_01',
    sectionTitle: 'Experience',
    position: 0,
    text: 'Built features',
    source: 'AI_GENERATED',
    sourceId: null,
    status: BulletStatus.CONFIRMED,
    ...override,
  }) as TailoringBullet;

// ---------------------------------------------------------------------------
// Service setup
// ---------------------------------------------------------------------------

describe('TailoringService', () => {
  let service: TailoringService;
  let resumeRepo: {
    create: ReturnType<typeof vi.fn>;
    save: ReturnType<typeof vi.fn>;
    findOne: ReturnType<typeof vi.fn>;
  };
  let bulletRepo: {
    find: ReturnType<typeof vi.fn>;
    findOne: ReturnType<typeof vi.fn>;
    save: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>;
  };
  let materialRepo: { findOne: ReturnType<typeof vi.fn> };
  let queue: { add: ReturnType<typeof vi.fn> };
  let quotaService: { consumeOnExport: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    resumeRepo = {
      create: vi.fn().mockImplementation((data) => data),
      save: vi.fn().mockImplementation((e) => Promise.resolve(e)),
      findOne: vi.fn(),
    };
    bulletRepo = {
      find: vi.fn().mockResolvedValue([]),
      findOne: vi.fn(),
      save: vi.fn().mockImplementation((e) => Promise.resolve(e)),
      count: vi.fn().mockResolvedValue(0),
    };
    materialRepo = { findOne: vi.fn() };
    queue = { add: vi.fn().mockResolvedValue(undefined) };
    quotaService = { consumeOnExport: vi.fn().mockResolvedValue(undefined) };

    service = new TailoringService(
      resumeRepo as any,
      bulletRepo as any,
      {} as any, // snapshotRepo (unused by tested methods)
      materialRepo as any,
      quotaService as any,
      queue as any,
    );
  });

  describe('start', () => {
    it('creates and saves a tailoring resume record', async () => {
      const result = await service.start('user_01', 'br_01', 'jd_01');
      expect(resumeRepo.save).toHaveBeenCalled();
      expect(result).toMatchObject({ userId: 'user_01', baseResumeId: 'br_01', parsedJdId: 'jd_01' });
    });

    it('enqueues tailor job to BullMQ', async () => {
      const result = await service.start('user_01', 'br_01', 'jd_01');
      expect(queue.add).toHaveBeenCalledWith('tailor', {
        tailoredResumeId: result.id,
        userId: 'user_01',
      });
    });
  });

  describe('findOne', () => {
    it('returns the tailored resume with reconstructed sections', async () => {
      resumeRepo.findOne.mockResolvedValue(makeResume());
      bulletRepo.find.mockResolvedValue([
        makeBullet({ id: 'b_01', text: 'Built features', status: BulletStatus.CONFIRMED }),
      ]);
      const result = await service.findOne('user_01', 'tr_01');
      expect(result.id).toBe('tr_01');
      expect(result.sections).toHaveLength(1);
      expect(result.sections[0].bullets).toHaveLength(1);
    });

    it('throws NotFoundException if record does not exist', async () => {
      resumeRepo.findOne.mockResolvedValue(null);
      await expect(service.findOne('user_01', 'tr_99')).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException if userId does not match', async () => {
      resumeRepo.findOne.mockResolvedValue(makeResume({ userId: 'other_user' }));
      await expect(service.findOne('user_01', 'tr_01')).rejects.toThrow(ForbiddenException);
    });
  });

  describe('editBullet', () => {
    it('updates bullet text and sets source to USER_EDITED', async () => {
      const existingBullet = makeBullet({ id: 'b_01', text: 'Built features', source: 'AI_GENERATED' });
      resumeRepo.findOne.mockResolvedValue(makeResume());
      bulletRepo.findOne.mockResolvedValue(existingBullet);
      bulletRepo.find.mockResolvedValue([{ ...existingBullet, text: 'Revised text', source: 'USER_EDITED' }]);

      await service.editBullet('user_01', 'tr_01', 'b_01', 'Revised text');

      const savedBullet = bulletRepo.save.mock.calls[0][0] as TailoringBullet;
      expect(savedBullet.text).toBe('Revised text');
      expect(savedBullet.source).toBe('USER_EDITED');
      expect(savedBullet.status).toBe(BulletStatus.USER_EDITED);
    });

    it('throws NotFoundException if bullet id does not exist', async () => {
      resumeRepo.findOne.mockResolvedValue(makeResume());
      bulletRepo.findOne.mockResolvedValue(null);
      await expect(service.editBullet('user_01', 'tr_01', 'b_99', 'text')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws ForbiddenException if userId does not match resume', async () => {
      resumeRepo.findOne.mockResolvedValue(makeResume({ userId: 'other_user' }));
      await expect(service.editBullet('user_01', 'tr_01', 'b_01', 'text')).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('exportPlainText', () => {
    it('returns bullet points as plain text', async () => {
      resumeRepo.findOne.mockResolvedValue(makeResume());
      bulletRepo.count.mockResolvedValue(0); // no PENDING bullets
      bulletRepo.find.mockResolvedValue([
        makeBullet({ id: 'b_01', text: 'Built features', status: BulletStatus.CONFIRMED }),
        makeBullet({ id: 'b_02', text: 'Shipped product', position: 1, status: BulletStatus.CONFIRMED }),
      ]);

      const text = await service.exportPlainText('user_01', 'tr_01');
      expect(text).toContain('• Built features');
      expect(text).toContain('• Shipped product');
    });

    it('calls consumeOnExport on QuotaService', async () => {
      resumeRepo.findOne.mockResolvedValue(makeResume());
      bulletRepo.count.mockResolvedValue(0);
      bulletRepo.find.mockResolvedValue([
        makeBullet({ status: BulletStatus.CONFIRMED }),
      ]);

      await service.exportPlainText('user_01', 'tr_01');
      expect(quotaService.consumeOnExport).toHaveBeenCalledWith('user_01', 'tr_01');
    });

    it('propagates ForbiddenException when quota is exhausted', async () => {
      resumeRepo.findOne.mockResolvedValue(makeResume());
      bulletRepo.count.mockResolvedValue(0);
      bulletRepo.find.mockResolvedValue([makeBullet({ status: BulletStatus.CONFIRMED })]);
      quotaService.consumeOnExport.mockRejectedValue(new ForbiddenException());
      await expect(service.exportPlainText('user_01', 'tr_01')).rejects.toThrow(ForbiddenException);
    });

    it('is idempotent — consumeOnExport handles dedup, not exportPlainText', async () => {
      // exportPlainText always delegates idempotency to QuotaService.
      // Two calls → two consumeOnExport calls (QuotaService skips the second internally).
      resumeRepo.findOne.mockResolvedValue(makeResume());
      bulletRepo.count.mockResolvedValue(0);
      bulletRepo.find.mockResolvedValue([makeBullet({ status: BulletStatus.CONFIRMED })]);
      await service.exportPlainText('user_01', 'tr_01');
      await service.exportPlainText('user_01', 'tr_01');
      expect(quotaService.consumeOnExport).toHaveBeenCalledTimes(2);
    });
  });

  describe('reApplyMaterial', () => {
    const makeMaterial = (overrides: Record<string, unknown> = {}) => ({
      id: 'mat_01',
      userId: 'user_01',
      status: 'CONFIRMED',
      shiningText: 'Led a major initiative',
      ...overrides,
    });

    it('sets bullet sourceId and status to CONFIRMED', async () => {
      const existingBullet = makeBullet({ id: 'b_01', status: BulletStatus.PENDING, sourceId: null });
      resumeRepo.findOne.mockResolvedValue(makeResume());
      materialRepo.findOne.mockResolvedValue(makeMaterial());
      bulletRepo.findOne.mockResolvedValue(existingBullet);
      bulletRepo.find.mockResolvedValue([{ ...existingBullet, sourceId: 'mat_01', status: BulletStatus.CONFIRMED }]);

      await service.reApplyMaterial('user_01', 'tr_01', 'b_01', 'mat_01');

      const savedBullet = bulletRepo.save.mock.calls[0][0] as TailoringBullet;
      expect(savedBullet.sourceId).toBe('mat_01');
      expect(savedBullet.status).toBe(BulletStatus.CONFIRMED);
    });

    it('accepts USER_EDITED material status', async () => {
      resumeRepo.findOne.mockResolvedValue(makeResume());
      materialRepo.findOne.mockResolvedValue(makeMaterial({ status: 'USER_EDITED' }));
      bulletRepo.findOne.mockResolvedValue(makeBullet({ id: 'b_01' }));
      bulletRepo.find.mockResolvedValue([makeBullet({ id: 'b_01' })]);

      await expect(
        service.reApplyMaterial('user_01', 'tr_01', 'b_01', 'mat_01'),
      ).resolves.not.toThrow();
    });

    it('throws NotFoundException when material does not exist', async () => {
      resumeRepo.findOne.mockResolvedValue(makeResume());
      materialRepo.findOne.mockResolvedValue(null);

      await expect(
        service.reApplyMaterial('user_01', 'tr_01', 'b_01', 'mat_01'),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when material belongs to another user', async () => {
      resumeRepo.findOne.mockResolvedValue(makeResume());
      materialRepo.findOne.mockResolvedValue(makeMaterial({ userId: 'other_user' }));

      await expect(
        service.reApplyMaterial('user_01', 'tr_01', 'b_01', 'mat_01'),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when material is not confirmed', async () => {
      resumeRepo.findOne.mockResolvedValue(makeResume());
      materialRepo.findOne.mockResolvedValue(makeMaterial({ status: 'PROPOSED' }));

      await expect(
        service.reApplyMaterial('user_01', 'tr_01', 'b_01', 'mat_01'),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException when bullet id does not exist', async () => {
      resumeRepo.findOne.mockResolvedValue(makeResume());
      materialRepo.findOne.mockResolvedValue(makeMaterial());
      bulletRepo.findOne.mockResolvedValue(null);

      await expect(
        service.reApplyMaterial('user_01', 'tr_01', 'b_99', 'mat_01'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
