import { vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { getQueueToken } from '@nestjs/bullmq';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { ProfileService, RESUME_PARSE_QUEUE } from '../../../src/contexts/profile/profile.service.js';
import { ProfileProfile } from '../../../src/database/entities/profile/profile.entity.js';
import { ProfileMaterial } from '../../../src/database/entities/profile/material.entity.js';
import { ProfileBaseResume } from '../../../src/database/entities/profile/base-resume.entity.js';
import { ProfileResumeSource } from '../../../src/database/entities/profile/resume-source.entity.js';
import { ProfileWorkExperience } from '../../../src/database/entities/profile/work-experience.entity.js';
import { ProfileEducation } from '../../../src/database/entities/profile/education.entity.js';
import { ProfileSkill } from '../../../src/database/entities/profile/skill.entity.js';
import { FIELD_CRYPTO } from '../../../src/common/crypto/crypto.interface.js';

const makeMaterial = (override: Partial<ProfileMaterial> = {}): ProfileMaterial =>
  ({
    id: 'mat_01',
    userId: 'user_01',
    rawText: Buffer.from('encrypted'),
    shiningText: 'Led migration',
    rationale: null,
    tags: ['leadership'],
    provenanceKind: 'conversation',
    status: 'PROPOSED',
    createdAt: new Date('2026-01-01'),
    ...override,
  }) as ProfileMaterial;

describe('ProfileService', () => {
  let service: ProfileService;
  let materialRepo: {
    find: ReturnType<typeof vi.fn>;
    findOne: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    save: ReturnType<typeof vi.fn>;
    remove: ReturnType<typeof vi.fn>;
  };
  let resumeSourceRepo: {
    create: ReturnType<typeof vi.fn>;
    save: ReturnType<typeof vi.fn>;
  };
  let crypto: { encrypt: ReturnType<typeof vi.fn>; decrypt: ReturnType<typeof vi.fn> };
  let parseQueue: { add: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    materialRepo = {
      find: vi.fn(),
      findOne: vi.fn(),
      create: vi.fn().mockImplementation((data) => data),
      save: vi.fn().mockImplementation((e) => Promise.resolve(e)),
      remove: vi.fn().mockResolvedValue(undefined),
    };
    resumeSourceRepo = {
      create: vi.fn().mockImplementation((data) => data),
      save: vi.fn().mockImplementation((e) => Promise.resolve(e)),
    };
    crypto = {
      encrypt: vi.fn().mockResolvedValue(Buffer.from('encrypted')),
      decrypt: vi.fn().mockResolvedValue('plaintext'),
    };
    parseQueue = { add: vi.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProfileService,
        { provide: getRepositoryToken(ProfileProfile), useValue: { findOne: vi.fn(), upsert: vi.fn() } },
        { provide: getRepositoryToken(ProfileMaterial), useValue: materialRepo },
        { provide: getRepositoryToken(ProfileBaseResume), useValue: { find: vi.fn(), create: vi.fn(), save: vi.fn() } },
        { provide: getRepositoryToken(ProfileResumeSource), useValue: resumeSourceRepo },
        { provide: getRepositoryToken(ProfileWorkExperience), useValue: { find: vi.fn(), findOne: vi.fn(), create: vi.fn(), save: vi.fn() } },
        { provide: getRepositoryToken(ProfileEducation), useValue: { find: vi.fn(), findOne: vi.fn(), create: vi.fn(), save: vi.fn() } },
        { provide: getRepositoryToken(ProfileSkill), useValue: { find: vi.fn(), findOne: vi.fn(), create: vi.fn(), save: vi.fn() } },
        { provide: FIELD_CRYPTO, useValue: crypto },
        { provide: getQueueToken(RESUME_PARSE_QUEUE), useValue: parseQueue },
      ],
    }).compile();

    service = module.get(ProfileService);
  });

  describe('uploadResume', () => {
    it('creates resume source record with PENDING status', async () => {
      const result = await service.uploadResume('user_01', 'blob://x', 'cv.pdf', 'application/pdf');
      expect(result).toMatchObject({
        userId: 'user_01',
        filename: 'cv.pdf',
        parseStatus: 'PENDING',
      });
    });

    it('enqueues parse job to RESUME_PARSE queue', async () => {
      const result = await service.uploadResume('user_01', 'blob://x', 'cv.pdf', 'application/pdf');
      expect(parseQueue.add).toHaveBeenCalledWith('parse', {
        sourceId: result.id,
        userId: 'user_01',
      });
    });
  });

  describe('createMaterial', () => {
    it('encrypts rawText before storing', async () => {
      await service.createMaterial('user_01', {
        rawText: 'secret text',
        provenanceKind: 'conversation',
      });
      expect(crypto.encrypt).toHaveBeenCalledWith('secret text');
      const saved = materialRepo.save.mock.calls[0][0];
      expect(saved.rawText).toEqual(Buffer.from('encrypted'));
    });

    it('sets status to PROPOSED by default', async () => {
      await service.createMaterial('user_01', { provenanceKind: 'conversation' });
      const saved = materialRepo.save.mock.calls[0][0];
      expect(saved.status).toBe('PROPOSED');
    });

    it('stores null rawText when rawText is omitted', async () => {
      await service.createMaterial('user_01', { shiningText: 'shine', provenanceKind: 'manual' });
      expect(crypto.encrypt).not.toHaveBeenCalled();
      const saved = materialRepo.save.mock.calls[0][0];
      expect(saved.rawText).toBeNull();
    });
  });

  describe('listMaterials', () => {
    it('decrypts rawText in returned materials', async () => {
      materialRepo.find.mockResolvedValue([makeMaterial()]);
      const results = await service.listMaterials('user_01');
      expect(crypto.decrypt).toHaveBeenCalled();
      expect(results[0].rawText).toBe('plaintext');
    });

    it('omits rawText field when it is null', async () => {
      materialRepo.find.mockResolvedValue([makeMaterial({ rawText: null })]);
      const results = await service.listMaterials('user_01');
      expect(crypto.decrypt).not.toHaveBeenCalled();
      expect(results[0].rawText).toBeUndefined();
    });

    it('queries materials ordered by createdAt DESC', async () => {
      materialRepo.find.mockResolvedValue([]);
      await service.listMaterials('user_01');
      expect(materialRepo.find).toHaveBeenCalledWith({
        where: { userId: 'user_01' },
        order: { createdAt: 'DESC' },
      });
    });
  });

  describe('updateMaterial', () => {
    it('applies patch fields and saves', async () => {
      materialRepo.findOne.mockResolvedValue(makeMaterial());
      await service.updateMaterial('user_01', 'mat_01', { status: 'CONFIRMED' });
      const saved = materialRepo.save.mock.calls[0][0];
      expect(saved.status).toBe('CONFIRMED');
    });

    it('throws NotFoundException when material does not exist', async () => {
      materialRepo.findOne.mockResolvedValue(null);
      await expect(service.updateMaterial('user_01', 'mat_99', {})).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws ForbiddenException when userId does not match', async () => {
      materialRepo.findOne.mockResolvedValue(makeMaterial({ userId: 'other_user' }));
      await expect(service.updateMaterial('user_01', 'mat_01', {})).rejects.toThrow(
        ForbiddenException,
      );
    });
  });
});
