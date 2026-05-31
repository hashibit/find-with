import { vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { MaterialManager } from '../../../src/contexts/profile/material-manager.service.js';
import { ProfileMaterial } from '../../../src/database/entities/profile/material.entity.js';

const makeMaterial = (override: Partial<ProfileMaterial> = {}): ProfileMaterial =>
  ({
    id: 'mat_01',
    userId: 'user_01',
    rawText: null,
    shiningText: 'Led team migration',
    rationale: 'ownership',
    tags: ['leadership'],
    provenanceKind: 'conversation',
    status: 'CONFIRMED',
    createdAt: new Date('2026-01-01'),
    ...override,
  }) as ProfileMaterial;

describe('MaterialManager', () => {
  let service: MaterialManager;
  let repo: { find: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    repo = { find: vi.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MaterialManager,
        { provide: getRepositoryToken(ProfileMaterial), useValue: repo },
      ],
    }).compile();

    service = module.get(MaterialManager);
  });

  describe('confirmedForUser', () => {
    it('queries only CONFIRMED materials for the user', async () => {
      repo.find.mockResolvedValue([]);
      await service.confirmedForUser('user_01');
      expect(repo.find).toHaveBeenCalledWith({
        where: { userId: 'user_01', status: 'CONFIRMED' },
        order: { createdAt: 'DESC' },
      });
    });

    it('returns the materials from the repo', async () => {
      const materials = [makeMaterial(), makeMaterial({ id: 'mat_02' })];
      repo.find.mockResolvedValue(materials);
      const result = await service.confirmedForUser('user_01');
      expect(result).toHaveLength(2);
    });
  });

  describe('forTailoring', () => {
    const m1 = makeMaterial({ id: 'mat_01' });
    const m2 = makeMaterial({ id: 'mat_02' });
    const m3 = makeMaterial({ id: 'mat_03' });

    beforeEach(() => {
      repo.find.mockResolvedValue([m1, m2, m3]);
    });

    it('returns all confirmed materials when selectedMaterialIds is null', async () => {
      const result = await service.forTailoring('user_01', null);
      expect(result).toEqual([m1, m2, m3]);
    });

    it('returns all confirmed materials when selectedMaterialIds is empty', async () => {
      const result = await service.forTailoring('user_01', []);
      expect(result).toEqual([m1, m2, m3]);
    });

    it('filters to only selected IDs when provided', async () => {
      const result = await service.forTailoring('user_01', ['mat_01', 'mat_03']);
      expect(result).toEqual([m1, m3]);
    });

    it('returns empty array when none of the selected IDs match', async () => {
      const result = await service.forTailoring('user_01', ['mat_99']);
      expect(result).toEqual([]);
    });
  });
});
