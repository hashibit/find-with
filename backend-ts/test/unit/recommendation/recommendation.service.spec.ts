// FILE: test/unit/recommendation/recommendation.service.spec.ts
import { vi } from 'vitest';
import { RecommendationService } from '../../../src/contexts/recommendation/recommendation.service.js';

function buildService() {
  const recoRepo = {
    create: vi.fn().mockImplementation((data) => data),
    save: vi.fn().mockImplementation((e) => Promise.resolve(e)),
    find: vi.fn().mockResolvedValue([]),
    findOne: vi.fn().mockResolvedValue(null),
  };
  const materialRepo = {
    find: vi.fn().mockResolvedValue([]),
  };
  const llm = {
    completeContext: vi.fn().mockResolvedValue('{"rankedJobs": []}'),
  };
  const config = {
    get: vi.fn().mockReturnValue({ kek: 'test-kek-32chars-padded-xxxxxxxx' }),
  };

  const service = new RecommendationService(
    recoRepo as any,
    materialRepo as any,
    llm as any,
    config as any,
  );

  return { service, recoRepo, materialRepo, llm, config };
}

describe('RecommendationService', () => {
  describe('listRecommendations', () => {
    it('calls recoRepo.find with correct query and returns result', async () => {
      const { service, recoRepo } = buildService();
      const fakeRecs = [{ id: 'rec_01', userId: 'u_01' }];
      recoRepo.find.mockResolvedValue(fakeRecs);

      const result = await service.listRecommendations('u_01');

      expect(recoRepo.find).toHaveBeenCalledWith({
        where: { userId: 'u_01' },
        order: { createdAt: 'DESC' },
        take: 10,
      });
      expect(result).toBe(fakeRecs);
    });
  });

  describe('recordClick', () => {
    it('silently does nothing when reco is not found (findOne returns null)', async () => {
      const { service, recoRepo } = buildService();
      recoRepo.findOne.mockResolvedValue(null);

      // recordClick delegates to recordFeedback which silently returns when not found
      await expect(service.recordClick('u_01', 'rec_99')).resolves.toBeUndefined();
      expect(recoRepo.save).not.toHaveBeenCalled();
    });

    it('updates feedback.clickedAt when reco is found', async () => {
      const { service, recoRepo } = buildService();
      const fakeRec = { id: 'rec_01', userId: 'u_01', feedback: {} };
      recoRepo.findOne.mockResolvedValue(fakeRec);

      await service.recordClick('u_01', 'rec_01');

      expect(recoRepo.save).toHaveBeenCalled();
      const saved = recoRepo.save.mock.calls[0][0] as any;
      expect(saved.feedback).toHaveProperty('clickedAt');
      expect(typeof saved.feedback.clickedAt).toBe('string');
    });
  });

  describe('recordFeedback', () => {
    it('does not save when reco is not found', async () => {
      const { service, recoRepo } = buildService();
      recoRepo.findOne.mockResolvedValue(null);

      await service.recordFeedback('u_01', 'rec_99', { rating: 5 });

      expect(recoRepo.save).not.toHaveBeenCalled();
    });

    it('merges feedback into reco.feedback and saves when found', async () => {
      const { service, recoRepo } = buildService();
      const fakeRec = { id: 'rec_01', userId: 'u_01', feedback: { existingKey: 'existing' } };
      recoRepo.findOne.mockResolvedValue(fakeRec);

      await service.recordFeedback('u_01', 'rec_01', { rating: 5, liked: true });

      expect(recoRepo.save).toHaveBeenCalled();
      const saved = recoRepo.save.mock.calls[0][0] as any;
      expect(saved.feedback).toMatchObject({ existingKey: 'existing', rating: 5, liked: true });
    });

    it('initialises feedback from null if reco.feedback was absent', async () => {
      const { service, recoRepo } = buildService();
      const fakeRec = { id: 'rec_01', userId: 'u_01', feedback: null };
      recoRepo.findOne.mockResolvedValue(fakeRec);

      await service.recordFeedback('u_01', 'rec_01', { rating: 3 });

      const saved = recoRepo.save.mock.calls[0][0] as any;
      expect(saved.feedback).toMatchObject({ rating: 3 });
    });
  });

  describe('buildTrackingId', () => {
    it('returns a hex string of at least 32 characters', () => {
      const { service } = buildService();
      const id = service.buildTrackingId('u_01', 'rec_01');
      expect(typeof id).toBe('string');
      expect(id).toMatch(/^[0-9a-f]+$/);
      expect(id.length).toBeGreaterThanOrEqual(32);
    });

    it('is deterministic — same inputs produce the same output', () => {
      const { service } = buildService();
      const id1 = service.buildTrackingId('u_01', 'rec_01');
      const id2 = service.buildTrackingId('u_01', 'rec_01');
      expect(id1).toBe(id2);
    });

    it('produces different IDs for different recoIds', () => {
      const { service } = buildService();
      const id1 = service.buildTrackingId('u_01', 'rec_01');
      const id2 = service.buildTrackingId('u_01', 'rec_02');
      expect(id1).not.toBe(id2);
    });
  });

  describe('buildDailyRecommendations', () => {
    it('calls recoRepo.save and returns a recommendation record with userId set', async () => {
      const { service, recoRepo } = buildService();

      // Stub fetchJobs so we don't hit SerpAPI
      (service as any).fetchJobs = vi.fn().mockResolvedValue([]);

      const result = await service.buildDailyRecommendations('u_01', 'software engineer remote');

      expect(recoRepo.save).toHaveBeenCalled();
      expect(result).toMatchObject({ userId: 'u_01' });
    });

    it('persists items from fetchJobs in the saved record', async () => {
      const { service, recoRepo } = buildService();
      const stubJobs = [
        {
          id: 'job-1',
          title: 'Engineer',
          company: 'Acme',
          location: 'Remote',
          url: 'https://example.com',
          snippet: 'Do things',
          source: 'stub',
        },
      ];
      (service as any).fetchJobs = vi.fn().mockResolvedValue(stubJobs);

      await service.buildDailyRecommendations('u_01', 'engineer');

      const saved = recoRepo.save.mock.calls[0][0] as any;
      // When no materials, rankJobs returns jobs as-is
      expect(saved.items).toEqual(stubJobs);
    });
  });
});
