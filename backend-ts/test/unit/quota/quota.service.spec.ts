import { vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ForbiddenException } from '@nestjs/common';
import { QuotaService } from '../../../src/contexts/quota/quota.service.js';
import { QuotaUsageCounter } from '../../../src/database/entities/quota/quota-counter.entity.js';
import { QuotaConsumeLog } from '../../../src/database/entities/quota/quota-log.entity.js';

const mockCounter = (override: Partial<QuotaUsageCounter> = {}): QuotaUsageCounter =>
  ({ userId: 'user_01', tailoringCompleted: 0, tailoringLimit: 3, windowStart: new Date(), ...override } as QuotaUsageCounter);

const mockRepo = (entity: unknown) => ({
  findOne: vi.fn(),
  create: vi.fn().mockImplementation((data) => data),
  save: vi.fn().mockImplementation((e) => Promise.resolve(e)),
  upsert: vi.fn().mockResolvedValue(undefined),
  manager: {
    transaction: vi.fn().mockImplementation((cb: (em: unknown) => Promise<void>) =>
      cb({
        increment: vi.fn().mockResolvedValue(undefined),
        save: vi.fn().mockResolvedValue(undefined),
        create: vi.fn().mockReturnValue({}),
      }),
    ),
  },
});

describe('QuotaService', () => {
  let service: QuotaService;
  let counterRepo: ReturnType<typeof mockRepo>;
  let logRepo: ReturnType<typeof mockRepo>;

  beforeEach(async () => {
    counterRepo = mockRepo(QuotaUsageCounter);
    logRepo = mockRepo(QuotaConsumeLog);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QuotaService,
        { provide: getRepositoryToken(QuotaUsageCounter), useValue: counterRepo },
        { provide: getRepositoryToken(QuotaConsumeLog), useValue: logRepo },
      ],
    }).compile();

    service = module.get<QuotaService>(QuotaService);
  });

  describe('getRemaining', () => {
    it('returns limit - completed', async () => {
      counterRepo.findOne.mockResolvedValue(mockCounter({ tailoringCompleted: 1, tailoringLimit: 3 }));
      expect(await service.getRemaining('user_01')).toBe(2);
    });

    it('returns 0 when exhausted', async () => {
      counterRepo.findOne.mockResolvedValue(mockCounter({ tailoringCompleted: 3, tailoringLimit: 3 }));
      expect(await service.getRemaining('user_01')).toBe(0);
    });

    it('creates counter if missing and returns default limit', async () => {
      counterRepo.findOne.mockResolvedValue(null);
      counterRepo.save.mockResolvedValue(mockCounter());
      expect(await service.getRemaining('user_01')).toBe(3);
      expect(counterRepo.save).toHaveBeenCalled();
    });
  });

  describe('consumeOnExport', () => {
    it('is idempotent — skips if log entry exists', async () => {
      logRepo.findOne.mockResolvedValue({ id: 'existing', tailoredResumeId: 'resume_01' });
      await service.consumeOnExport('user_01', 'resume_01');
      expect(counterRepo.manager.transaction).not.toHaveBeenCalled();
    });

    it('throws ForbiddenException when quota exhausted', async () => {
      logRepo.findOne.mockResolvedValue(null);
      counterRepo.findOne.mockResolvedValue(mockCounter({ tailoringCompleted: 3, tailoringLimit: 3 }));
      await expect(service.consumeOnExport('user_01', 'resume_02')).rejects.toThrow(ForbiddenException);
    });

    it('increments counter and writes log when within quota', async () => {
      logRepo.findOne.mockResolvedValue(null);
      counterRepo.findOne.mockResolvedValue(mockCounter({ tailoringCompleted: 1, tailoringLimit: 3 }));
      await service.consumeOnExport('user_01', 'resume_02');
      expect(counterRepo.manager.transaction).toHaveBeenCalled();
    });
  });
});
