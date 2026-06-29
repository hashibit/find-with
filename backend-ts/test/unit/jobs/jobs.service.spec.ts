import { vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { getQueueToken } from '@nestjs/bullmq';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { JobsService, JOB_ANALYZE_QUEUE } from '../../../src/contexts/jobs/jobs.service.js';
import { JobCapture } from '../../../src/database/entities/jobs/job-capture.entity.js';
import { JobParsedJd } from '../../../src/database/entities/jobs/parsed-jd.entity.js';
import { JobCompanyBrief } from '../../../src/database/entities/jobs/company-brief.entity.js';
import { JobMatchResult } from '../../../src/database/entities/jobs/match-result.entity.js';
import { JobRadarItem } from '../../../src/database/entities/jobs/radar-item.entity.js';
import { ProfileSkill } from '../../../src/database/entities/profile/skill.entity.js';

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
  let companyRepo: { findOne: ReturnType<typeof vi.fn> };
  let matchRepo: { findOne: ReturnType<typeof vi.fn> };
  let skillRepo: { find: ReturnType<typeof vi.fn> };
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
    companyRepo = { findOne: vi.fn().mockResolvedValue(null) };
    matchRepo = { findOne: vi.fn().mockResolvedValue(null) };
    skillRepo = { find: vi.fn().mockResolvedValue([]) };
    analyzeQueue = { add: vi.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JobsService,
        { provide: getRepositoryToken(JobCapture), useValue: captureRepo },
        { provide: getRepositoryToken(JobParsedJd), useValue: jdRepo },
        { provide: getRepositoryToken(JobCompanyBrief), useValue: companyRepo },
        { provide: getRepositoryToken(JobMatchResult), useValue: matchRepo },
        { provide: getRepositoryToken(JobRadarItem), useValue: radarRepo },
        { provide: getRepositoryToken(ProfileSkill), useValue: skillRepo },
        { provide: getQueueToken(JOB_ANALYZE_QUEUE), useValue: analyzeQueue },
      ],
    }).compile();

    service = module.get(JobsService);
  });

  describe('captureJob', () => {
    it('creates capture and radar item with heuristic quickMatch (no LLM queue)', async () => {
      const { capture, radarItem, quickMatch } = await service.captureJob('user_01', {
        source: 'linkedin',
        sourceUrl: 'https://linkedin.com/jobs/123',
        capturedText: 'Senior PM at Stripe\n\nWe are looking for a Senior PM.',
      });
      expect(captureRepo.save).toHaveBeenCalled();
      expect(radarRepo.save).toHaveBeenCalled();
      // LLM analysis is NOT auto-queued — enqueueAnalysis must be called explicitly
      expect(analyzeQueue.add).not.toHaveBeenCalled();
      expect(radarItem.status).toBe('BROWSED');
      expect(quickMatch).toMatchObject({ score: expect.any(Number), matchedSkills: [], missingKeywords: [] });
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
    it('returns id, status, parsedJd=null, matchResult=null, companyBrief=null when no enrichment', async () => {
      captureRepo.findOne.mockResolvedValue(makeCapture());
      radarRepo.findOne.mockResolvedValue(makeRadarItem());
      const result = await service.getJob('user_01', 'cap_01');
      expect(result.id).toBe('cap_01');
      expect(result.status).toBe('BROWSED');
      expect(result.parsedJd).toBeNull();
      expect(result.matchResult).toBeNull();
      expect(result.companyBrief).toBeNull();
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
