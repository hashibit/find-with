import { vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { getQueueToken } from '@nestjs/bullmq';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { JobsService, JOB_ANALYZE_QUEUE } from '../../../src/contexts/jobs/jobs.service.js';
import { JobCapture } from '../../../src/database/entities/jobs/job-capture.entity.js';
import { JobParsedJd } from '../../../src/database/entities/jobs/parsed-jd.entity.js';
import { JobMatchResult } from '../../../src/database/entities/jobs/match-result.entity.js';
import { JobRadarItem } from '../../../src/database/entities/jobs/radar-item.entity.js';

const makeCapture = (override: Partial<JobCapture> = {}): JobCapture =>
  ({
    id: 'cap_01',
    userId: 'user_01',
    source: 'linkedin',
    sourceUrl: 'https://linkedin.com/jobs/123',
    capturedText: 'Senior PM at Stripe',
    ...override,
  }) as JobCapture;

const makeRadarItem = (override: Partial<JobRadarItem> = {}): JobRadarItem =>
  ({
    id: 'radar_01',
    userId: 'user_01',
    captureId: 'cap_01',
    status: 'BROWSED',
    lastStatusAt: new Date(),
    ...override,
  }) as JobRadarItem;

describe('JobsService', () => {
  let service: JobsService;
  let captureRepo: {
    create: ReturnType<typeof vi.fn>;
    save: ReturnType<typeof vi.fn>;
    findOne: ReturnType<typeof vi.fn>;
  };
  let radarRepo: {
    create: ReturnType<typeof vi.fn>;
    save: ReturnType<typeof vi.fn>;
    findOne: ReturnType<typeof vi.fn>;
    find: ReturnType<typeof vi.fn>;
  };
  let jdRepo: { findOne: ReturnType<typeof vi.fn> };
  let matchRepo: { findOne: ReturnType<typeof vi.fn> };
  let analyzeQueue: { add: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    captureRepo = {
      create: vi.fn().mockImplementation((data) => data),
      save: vi.fn().mockImplementation((e) => Promise.resolve(e)),
      findOne: vi.fn(),
    };
    radarRepo = {
      create: vi.fn().mockImplementation((data) => data),
      save: vi.fn().mockImplementation((e) => Promise.resolve(e)),
      findOne: vi.fn(),
      find: vi.fn(),
    };
    jdRepo = { findOne: vi.fn().mockResolvedValue(null) };
    matchRepo = { findOne: vi.fn().mockResolvedValue(null) };
    analyzeQueue = { add: vi.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JobsService,
        { provide: getRepositoryToken(JobCapture), useValue: captureRepo },
        { provide: getRepositoryToken(JobParsedJd), useValue: jdRepo },
        { provide: getRepositoryToken(JobMatchResult), useValue: matchRepo },
        { provide: getRepositoryToken(JobRadarItem), useValue: radarRepo },
        { provide: getQueueToken(JOB_ANALYZE_QUEUE), useValue: analyzeQueue },
      ],
    }).compile();

    service = module.get(JobsService);
  });

  describe('captureJob', () => {
    it('creates capture and radar item, enqueues analyze job', async () => {
      const { capture, radarItem } = await service.captureJob('user_01', {
        source: 'linkedin',
        sourceUrl: 'https://linkedin.com/jobs/123',
      });
      expect(captureRepo.save).toHaveBeenCalled();
      expect(radarRepo.save).toHaveBeenCalled();
      expect(analyzeQueue.add).toHaveBeenCalledWith('analyze', {
        captureId: capture.id,
        userId: 'user_01',
      });
      expect(radarItem.status).toBe('BROWSED');
    });

    it('sets radar item status to BROWSED on creation', async () => {
      const { radarItem } = await service.captureJob('user_01', {
        source: 'indeed',
        sourceUrl: 'https://indeed.com/job/456',
      });
      expect(radarItem.status).toBe('BROWSED');
    });
  });

  describe('getJob', () => {
    it('returns capture, parsedJd, matchResult, radarItem', async () => {
      captureRepo.findOne.mockResolvedValue(makeCapture());
      radarRepo.findOne.mockResolvedValue(makeRadarItem());
      const result = await service.getJob('user_01', 'cap_01');
      expect(result.capture.id).toBe('cap_01');
      expect(result.parsedJd).toBeNull();
      expect(result.matchResult).toBeNull();
    });

    it('throws NotFoundException when capture does not exist', async () => {
      captureRepo.findOne.mockResolvedValue(null);
      await expect(service.getJob('user_01', 'cap_99')).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when userId does not match', async () => {
      captureRepo.findOne.mockResolvedValue(makeCapture({ userId: 'other_user' }));
      await expect(service.getJob('user_01', 'cap_01')).rejects.toThrow(ForbiddenException);
    });
  });

  describe('updateRadarStatus', () => {
    it('transitions BROWSED → ANALYZED successfully', async () => {
      radarRepo.findOne.mockResolvedValue(makeRadarItem({ status: 'BROWSED' }));
      const result = await service.updateRadarStatus('user_01', 'radar_01', 'ANALYZED');
      expect(result.status).toBe('ANALYZED');
    });

    it('throws ForbiddenException for invalid state transition', async () => {
      radarRepo.findOne.mockResolvedValue(makeRadarItem({ status: 'BROWSED' }));
      await expect(
        service.updateRadarStatus('user_01', 'radar_01', 'APPLIED'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws NotFoundException when radar item does not exist', async () => {
      radarRepo.findOne.mockResolvedValue(null);
      await expect(service.updateRadarStatus('user_01', 'radar_99', 'ANALYZED')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws ForbiddenException when userId does not match', async () => {
      radarRepo.findOne.mockResolvedValue(makeRadarItem({ userId: 'other_user' }));
      await expect(service.updateRadarStatus('user_01', 'radar_01', 'ANALYZED')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('stores userDecisionNote when provided', async () => {
      radarRepo.findOne.mockResolvedValue(makeRadarItem({ status: 'BROWSED' }));
      await service.updateRadarStatus('user_01', 'radar_01', 'ANALYZED', 'great role');
      const saved = radarRepo.save.mock.calls[0][0] as JobRadarItem;
      expect(saved.userDecisionNote).toBe('great role');
    });
  });
});
