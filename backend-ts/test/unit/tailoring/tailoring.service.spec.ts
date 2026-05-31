import { vi } from 'vitest';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { TailoringService } from '../../../src/contexts/tailoring/tailoring.service.js';
import { TailoringResume } from '../../../src/database/entities/tailoring/tailoring-resume.entity.js';

type Section = { title: string; bullets: Array<{ id: string; text: string; source: string }> };

const makeResume = (override: Partial<TailoringResume> = {}): TailoringResume =>
  ({
    id: 'tr_01',
    userId: 'user_01',
    baseResumeId: 'br_01',
    parsedJdId: 'jd_01',
    sections: [
      {
        title: 'Experience',
        bullets: [
          { id: 'b_01', text: 'Built features', source: 'AI_GENERATED' },
          { id: 'b_02', text: 'Shipped product', source: 'AI_GENERATED' },
        ],
      },
    ] as Section[],
    ...override,
  }) as TailoringResume;

describe('TailoringService', () => {
  let service: TailoringService;
  let resumeRepo: { create: ReturnType<typeof vi.fn>; save: ReturnType<typeof vi.fn>; findOne: ReturnType<typeof vi.fn> };
  let queue: { add: ReturnType<typeof vi.fn> };
  let quotaService: { consumeOnExport: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    resumeRepo = {
      create: vi.fn().mockImplementation((data) => data),
      save: vi.fn().mockImplementation((e) => Promise.resolve(e)),
      findOne: vi.fn(),
    };
    queue = { add: vi.fn().mockResolvedValue(undefined) };
    quotaService = { consumeOnExport: vi.fn().mockResolvedValue(undefined) };

    // Construct directly — TailoringService.quota has no @Inject decorator, so
    // NestJS Test module can't resolve it via type metadata in the vitest/esbuild context.
    service = new TailoringService(
      resumeRepo as any,
      {} as any, // snapshotRepo (unused by tested methods)
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
    it('returns the tailored resume', async () => {
      resumeRepo.findOne.mockResolvedValue(makeResume());
      const result = await service.findOne('user_01', 'tr_01');
      expect(result.id).toBe('tr_01');
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
      resumeRepo.findOne.mockResolvedValue(makeResume());
      await service.editBullet('user_01', 'tr_01', 'b_01', 'Revised text');
      const saved = resumeRepo.save.mock.calls[0][0] as TailoringResume;
      const bullets = (saved.sections as Section[])[0].bullets;
      const bullet = bullets.find((b) => b.id === 'b_01')!;
      expect(bullet.text).toBe('Revised text');
      expect(bullet.source).toBe('USER_EDITED');
    });

    it('does not modify other bullets', async () => {
      resumeRepo.findOne.mockResolvedValue(makeResume());
      await service.editBullet('user_01', 'tr_01', 'b_01', 'New text');
      const saved = resumeRepo.save.mock.calls[0][0] as TailoringResume;
      const bullets = (saved.sections as Section[])[0].bullets;
      const untouched = bullets.find((b) => b.id === 'b_02')!;
      expect(untouched.source).toBe('AI_GENERATED');
    });

    it('throws NotFoundException if bullet id does not exist', async () => {
      resumeRepo.findOne.mockResolvedValue(makeResume());
      await expect(service.editBullet('user_01', 'tr_01', 'b_99', 'text')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('exportPlainText', () => {
    it('returns bullet points as plain text', async () => {
      resumeRepo.findOne.mockResolvedValue(makeResume());
      const text = await service.exportPlainText('user_01', 'tr_01');
      expect(text).toContain('• Built features');
      expect(text).toContain('• Shipped product');
    });

    it('calls consumeOnExport on QuotaService', async () => {
      resumeRepo.findOne.mockResolvedValue(makeResume());
      await service.exportPlainText('user_01', 'tr_01');
      expect(quotaService.consumeOnExport).toHaveBeenCalledWith('user_01', 'tr_01');
    });

    it('propagates ForbiddenException when quota is exhausted', async () => {
      resumeRepo.findOne.mockResolvedValue(makeResume());
      quotaService.consumeOnExport.mockRejectedValue(new ForbiddenException());
      await expect(service.exportPlainText('user_01', 'tr_01')).rejects.toThrow(ForbiddenException);
    });

    it('is idempotent — consumeOnExport handles dedup, not exportPlainText', async () => {
      // exportPlainText always delegates idempotency to QuotaService.
      // Two calls → two consumeOnExport calls (QuotaService skips the second internally).
      resumeRepo.findOne.mockResolvedValue(makeResume());
      await service.exportPlainText('user_01', 'tr_01');
      await service.exportPlainText('user_01', 'tr_01');
      expect(quotaService.consumeOnExport).toHaveBeenCalledTimes(2);
    });
  });
});
