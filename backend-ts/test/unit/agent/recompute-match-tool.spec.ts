// FILE: test/unit/agent/recompute-match-tool.spec.ts
import { vi } from 'vitest';
import { RecomputeMatchTool } from '../../../src/agent/tools/recompute-match.tool.js';

const makeRadar = () =>
  ({ id: 'r_01', userId: 'u_01', parsedJdId: 'jd_01' }) as any;

const makeJd = (embedding?: number[]) =>
  ({
    id: 'jd_01',
    hardSkills: ['TypeScript', 'NestJS'],
    jdEmbedding: embedding ?? null,
  }) as any;

const makeMatch = () =>
  ({
    id: 'mr_01',
    parsedJdId: 'jd_01',
    surfaceScore: 60,
    deepScore: 40,
    hitsSurface: ['TypeScript'],
    hitsDeep: [],
    gaps: ['NestJS'],
  }) as any;

const makeMaterial = (embedding?: number[]) =>
  ({
    id: 'm_01',
    userId: 'u_01',
    status: 'CONFIRMED',
    shiningText: 'Built NestJS APIs',
    tags: ['TypeScript'],
    embedding: embedding ?? null,
  }) as any;

function buildTool() {
  const radarRepo = {
    findOne: vi.fn().mockResolvedValue(null),
    find: vi.fn().mockResolvedValue([]),
    save: vi.fn().mockImplementation((e) => Promise.resolve(e)),
  };
  const matchRepo = {
    findOne: vi.fn().mockResolvedValue(null),
    find: vi.fn().mockResolvedValue([]),
    save: vi.fn().mockImplementation((e) => Promise.resolve(e)),
  };
  const jdRepo = {
    findOne: vi.fn().mockResolvedValue(null),
    find: vi.fn().mockResolvedValue([]),
    save: vi.fn().mockImplementation((e) => Promise.resolve(e)),
  };
  // Mock for SemanticMaterialLoaderService
  const materialLoader = {
    rankByEmbedding: vi.fn().mockResolvedValue([]),
    loadAll: vi.fn().mockResolvedValue([]),
    loadForPromptContext: vi.fn().mockResolvedValue([]),
  };

  const tool = new RecomputeMatchTool(
    radarRepo as any,
    matchRepo as any,
    jdRepo as any,
    materialLoader as any,
  );

  return { tool, radarRepo, matchRepo, jdRepo, materialLoader };
}

const ctx = { userId: 'u_01', conversationId: 'conv_01' };
const params = { radar_item_id: 'r_01' };

describe('RecomputeMatchTool', () => {
  describe('execute — error paths', () => {
    it('returns not_found when radarRepo.findOne returns null', async () => {
      const { tool, radarRepo } = buildTool();
      radarRepo.findOne.mockResolvedValue(null);

      const result = await tool.execute('tc_01', params, ctx);

      expect(result.details).toMatchObject({ error: 'not_found' });
    });

    it('returns no_parsed_jd when radarItem.parsedJdId is null', async () => {
      const { tool, radarRepo } = buildTool();
      radarRepo.findOne.mockResolvedValue({ id: 'r_01', userId: 'u_01', parsedJdId: null });

      const result = await tool.execute('tc_01', params, ctx);

      expect(result.details).toMatchObject({ error: 'no_parsed_jd' });
    });

    it('returns parsed_jd_missing when jdRepo.findOne returns null', async () => {
      const { tool, radarRepo, jdRepo } = buildTool();
      radarRepo.findOne.mockResolvedValue(makeRadar());
      jdRepo.findOne.mockResolvedValue(null);

      const result = await tool.execute('tc_01', params, ctx);

      expect(result.details).toMatchObject({ error: 'parsed_jd_missing' });
    });

    it('returns match_result_missing when matchRepo.findOne returns null', async () => {
      const { tool, radarRepo, jdRepo, matchRepo } = buildTool();
      radarRepo.findOne.mockResolvedValue(makeRadar());
      jdRepo.findOne.mockResolvedValue(makeJd());
      matchRepo.findOne.mockResolvedValue(null);

      const result = await tool.execute('tc_01', params, ctx);

      expect(result.details).toMatchObject({ error: 'match_result_missing' });
    });
  });

  describe('execute — success (no embeddings)', () => {
    it('calls matchRepo.save with an updated deepScore', async () => {
      const { tool, radarRepo, jdRepo, matchRepo, materialLoader } = buildTool();
      radarRepo.findOne.mockResolvedValue(makeRadar());
      jdRepo.findOne.mockResolvedValue(makeJd()); // no jdEmbedding → loadAll path
      matchRepo.findOne.mockResolvedValue(makeMatch());
      materialLoader.loadAll.mockResolvedValue([makeMaterial()]);

      await tool.execute('tc_01', params, ctx);

      expect(matchRepo.save).toHaveBeenCalled();
      const saved = matchRepo.save.mock.calls[0][0] as any;
      expect(typeof saved.deepScore).toBe('number');
    });

    it('returns surfaceScore equal to existing matchResult.surfaceScore', async () => {
      const { tool, radarRepo, jdRepo, matchRepo, materialLoader } = buildTool();
      radarRepo.findOne.mockResolvedValue(makeRadar());
      jdRepo.findOne.mockResolvedValue(makeJd());
      matchRepo.findOne.mockResolvedValue(makeMatch());
      materialLoader.loadAll.mockResolvedValue([makeMaterial()]);

      const result = await tool.execute('tc_01', params, ctx);

      expect(result.details).toHaveProperty('surfaceScore', 60);
    });

    it('returns a gaps array (may be empty)', async () => {
      const { tool, radarRepo, jdRepo, matchRepo, materialLoader } = buildTool();
      radarRepo.findOne.mockResolvedValue(makeRadar());
      jdRepo.findOne.mockResolvedValue(makeJd());
      matchRepo.findOne.mockResolvedValue(makeMatch());
      materialLoader.loadAll.mockResolvedValue([makeMaterial()]);

      const result = await tool.execute('tc_01', params, ctx);

      expect(result.details).toHaveProperty('gaps');
      expect(Array.isArray(result.details['gaps'])).toBe(true);
    });

    it('result.content[0].text contains Surface and Deep labels', async () => {
      const { tool, radarRepo, jdRepo, matchRepo, materialLoader } = buildTool();
      radarRepo.findOne.mockResolvedValue(makeRadar());
      jdRepo.findOne.mockResolvedValue(makeJd());
      matchRepo.findOne.mockResolvedValue(makeMatch());
      materialLoader.loadAll.mockResolvedValue([]);

      const result = await tool.execute('tc_01', params, ctx);

      expect(result.content[0].text).toContain('Surface');
      expect(result.content[0].text).toContain('Deep');
    });
  });

  describe('execute — success (with embeddings)', () => {
    it('deepScore is 100 when material embedding is a perfect cosine match to jd embedding', async () => {
      const { tool, radarRepo, jdRepo, matchRepo, materialLoader } = buildTool();
      radarRepo.findOne.mockResolvedValue(makeRadar());
      jdRepo.findOne.mockResolvedValue(makeJd([1, 0, 0]));
      matchRepo.findOne.mockResolvedValue(makeMatch());
      // rankByEmbedding returns pre-ranked results with cosine score
      materialLoader.rankByEmbedding.mockResolvedValue([{ material: makeMaterial([1, 0, 0]), score: 1.0 }]);

      const result = await tool.execute('tc_01', params, ctx);

      expect(result.details).toHaveProperty('deepScore', 100);
    });

    it('calls matchRepo.save with deepScore = 100 on perfect cosine match', async () => {
      const { tool, radarRepo, jdRepo, matchRepo, materialLoader } = buildTool();
      radarRepo.findOne.mockResolvedValue(makeRadar());
      jdRepo.findOne.mockResolvedValue(makeJd([1, 0, 0]));
      matchRepo.findOne.mockResolvedValue(makeMatch());
      materialLoader.rankByEmbedding.mockResolvedValue([{ material: makeMaterial([1, 0, 0]), score: 1.0 }]);

      await tool.execute('tc_01', params, ctx);

      const saved = matchRepo.save.mock.calls[0][0] as any;
      expect(saved.deepScore).toBe(100);
    });

    it('deepScore is 0 when material embedding is orthogonal to jd embedding', async () => {
      const { tool, radarRepo, jdRepo, matchRepo, materialLoader } = buildTool();
      radarRepo.findOne.mockResolvedValue(makeRadar());
      jdRepo.findOne.mockResolvedValue(makeJd([1, 0, 0]));
      matchRepo.findOne.mockResolvedValue(makeMatch());
      // Orthogonal vector → cosine similarity = 0
      materialLoader.rankByEmbedding.mockResolvedValue([{ material: makeMaterial([0, 1, 0]), score: 0.0 }]);

      const result = await tool.execute('tc_01', params, ctx);

      expect(result.details).toHaveProperty('deepScore', 0);
    });
  });
});
