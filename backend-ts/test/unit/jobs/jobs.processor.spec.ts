import { vi } from 'vitest';
import { JobsProcessor } from '../../../src/contexts/jobs/jobs.processor.js';
import { SearchCompanyTool } from '../../../src/agent/tools/search-company.tool.js';
import type { Job } from 'bullmq';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makeLlm = () => ({
  structuredComplete: vi.fn().mockResolvedValue({}),
  embed: vi.fn().mockResolvedValue([]),
  streamContext: vi.fn(),
  recordError: vi.fn(),
  clearErrors: vi.fn(),
});

const makeCaptureRepo = () => ({
  findOne: vi.fn(),
});

const makeJdRepo = () => ({
  findOne: vi.fn().mockResolvedValue(null),
  create: vi.fn().mockImplementation((data) => data),
  save: vi.fn().mockImplementation((e) => Promise.resolve(e)),
  update: vi.fn().mockResolvedValue(undefined),
});

const makeCompanyRepo = () => ({
  findOne: vi.fn().mockResolvedValue(null),
  create: vi.fn().mockImplementation((data) => data),
  save: vi.fn().mockImplementation((e) => Promise.resolve(e)),
});

const makeMatchRepo = () => ({
  findOne: vi.fn().mockResolvedValue(null),
  create: vi.fn().mockImplementation((data) => data),
  save: vi.fn().mockImplementation((e) => Promise.resolve(e)),
});

const makeRadarRepo = () => ({
  update: vi.fn().mockResolvedValue(undefined),
});

const makeMaterialManager = () => ({
  confirmedForUser: vi.fn().mockResolvedValue([]),
});

const makeBullJob = (data: { captureId: string; userId: string }): Job<{ captureId: string; userId: string }> =>
  ({ data } as unknown as Job<{ captureId: string; userId: string }>);

function buildProcessor(overrides: Partial<{
  captureRepo: ReturnType<typeof makeCaptureRepo>;
  jdRepo: ReturnType<typeof makeJdRepo>;
  companyRepo: ReturnType<typeof makeCompanyRepo>;
  matchRepo: ReturnType<typeof makeMatchRepo>;
  radarRepo: ReturnType<typeof makeRadarRepo>;
  llm: ReturnType<typeof makeLlm>;
  materialManager: ReturnType<typeof makeMaterialManager>;
}> = {}) {
  const captureRepo = overrides.captureRepo ?? makeCaptureRepo();
  const jdRepo = overrides.jdRepo ?? makeJdRepo();
  const matchRepo = overrides.matchRepo ?? makeMatchRepo();
  const radarRepo = overrides.radarRepo ?? makeRadarRepo();
  const llm = overrides.llm ?? makeLlm();
  const materialManager = overrides.materialManager ?? makeMaterialManager();
  const companyRepo = overrides.companyRepo ?? makeCompanyRepo();

  // Real SearchCompanyTool sharing the same llm mock; config mock disables
  // braveSearch (no apiKey) so tests never hit the network.
  const config = { get: vi.fn().mockReturnValue({ apiKey: undefined }) };
  const companySearcher = new SearchCompanyTool(companyRepo as any, llm as any, config as any);

  const processor = new JobsProcessor(
    captureRepo as any,
    jdRepo as any,
    matchRepo as any,
    radarRepo as any,
    llm as any,
    materialManager as any,
    companySearcher as any,
  );

  return { processor, captureRepo, jdRepo, companyRepo, matchRepo, radarRepo, llm, materialManager };
}

// structuredComplete returns the schema-decoded object — not a JSON string
const JD_RESPONSE = {
  title: 'Senior PM',
  company: 'Stripe',
  location: 'Remote',
  hardSkills: ['React', 'TypeScript', 'Node.js'],
  softSkills: ['communication'],
  experience: { yearsMin: 5, yearsMax: 10, industries: ['fintech'] },
  educationRequired: { degree: 'BS', required: false },
  hiddenSignals: ['fast-paced'],
  niceToHave: ['Go'],
  buzzwordTranslation: 'PM role building payment APIs',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('JobsProcessor', () => {
  describe('process()', () => {
    it('returns early when capture does not exist', async () => {
      const { processor, captureRepo, jdRepo } = buildProcessor();
      captureRepo.findOne.mockResolvedValue(null);

      await processor.process(makeBullJob({ captureId: 'cap_missing', userId: 'u1' }));

      expect(jdRepo.save).not.toHaveBeenCalled();
    });

    it('parses JD when no parsedJd exists and saves result', async () => {
      const { processor, captureRepo, jdRepo, llm } = buildProcessor();
      captureRepo.findOne.mockResolvedValue({ id: 'cap_01', capturedText: 'Senior PM at Stripe' });
      llm.structuredComplete.mockResolvedValueOnce(JD_RESPONSE);

      await processor.process(makeBullJob({ captureId: 'cap_01', userId: 'u1' }));

      expect(jdRepo.save).toHaveBeenCalled();
      const saved = jdRepo.save.mock.calls[0][0] as Record<string, unknown>;
      expect(saved['title']).toBe('Senior PM');
      expect(saved['company']).toBe('Stripe');
    });

    it('skips JD parsing when parsedJd already exists (idempotent)', async () => {
      const existingJd = {
        id: 'jd_01',
        captureId: 'cap_01',
        title: 'Existing PM',
        company: 'Stripe',
        hardSkills: ['React'],
        jdEmbedding: null,
      };
      const { processor, captureRepo, jdRepo, llm } = buildProcessor();
      captureRepo.findOne.mockResolvedValue({ id: 'cap_01', capturedText: '' });
      jdRepo.findOne.mockResolvedValueOnce(existingJd);

      await processor.process(makeBullJob({ captureId: 'cap_01', userId: 'u1' }));

      // LLM should not be called for JD parsing (second call would be company research)
      const jdParseCall = llm.structuredComplete.mock.calls.find((c) =>
        String(c[0]?.messages?.[0]?.content).includes('Parse this job description'),
      );
      expect(jdParseCall).toBeUndefined();
    });

    it('saves nulls when structuredComplete returns an empty object', async () => {
      const { processor, captureRepo, jdRepo, llm } = buildProcessor();
      captureRepo.findOne.mockResolvedValue({ id: 'cap_01', capturedText: 'some text' });
      llm.structuredComplete.mockResolvedValueOnce({});

      await processor.process(makeBullJob({ captureId: 'cap_01', userId: 'u1' }));

      expect(jdRepo.save).toHaveBeenCalled();
      const saved = jdRepo.save.mock.calls[0][0] as Record<string, unknown>;
      // Fields should fall back to null
      expect(saved['title']).toBeNull();
    });

    it('skips match scoring when matchResult already exists (idempotent)', async () => {
      const existingJd = { id: 'jd_01', captureId: 'cap_01', hardSkills: ['React'], jdEmbedding: null, company: null };
      const existingMatch = { id: 'match_01', parsedJdId: 'jd_01' };
      const { processor, captureRepo, jdRepo, matchRepo, materialManager } = buildProcessor();
      captureRepo.findOne.mockResolvedValue({ id: 'cap_01', capturedText: '' });
      jdRepo.findOne.mockResolvedValueOnce(existingJd);
      matchRepo.findOne.mockResolvedValue(existingMatch);

      await processor.process(makeBullJob({ captureId: 'cap_01', userId: 'u1' }));

      expect(materialManager.confirmedForUser).not.toHaveBeenCalled();
      expect(matchRepo.save).not.toHaveBeenCalled();
    });

    it('sets radar status to ANALYZED after processing', async () => {
      const { processor, captureRepo, jdRepo, llm, radarRepo } = buildProcessor();
      captureRepo.findOne.mockResolvedValue({ id: 'cap_01', capturedText: '' });
      llm.structuredComplete.mockResolvedValueOnce(JD_RESPONSE);
      // embed returns empty array so deep scoring uses fallback
      llm.embed.mockResolvedValue([]);

      await processor.process(makeBullJob({ captureId: 'cap_01', userId: 'u1' }));

      expect(radarRepo.update).toHaveBeenCalledWith(
        { captureId: 'cap_01' },
        expect.objectContaining({ status: 'ANALYZED' }),
      );
    });

    describe('surface match scoring', () => {
      async function runWithSkills(hardSkills: string[], capturedText: string) {
        const parsedJd = {
          id: 'jd_01',
          captureId: 'cap_01',
          hardSkills,
          company: null,
          jdEmbedding: null,
          title: 'Engineer',
        };
        const { processor, captureRepo, jdRepo, matchRepo } = buildProcessor();
        captureRepo.findOne.mockResolvedValue({ id: 'cap_01', capturedText });
        jdRepo.findOne.mockResolvedValueOnce(parsedJd);
        matchRepo.findOne.mockResolvedValue(null);

        await processor.process(makeBullJob({ captureId: 'cap_01', userId: 'u1' }));

        const saved = matchRepo.save.mock.calls[0]?.[0] as Record<string, unknown> | undefined;
        return saved;
      }

      it('scores 100% when all hard skills appear in JD text', async () => {
        const saved = await runWithSkills(['React', 'Node.js'], 'We need React and Node.js skills');
        expect(saved?.['surfaceScore']).toBe(100);
        expect(saved?.['overallAdvice']).toBe('APPLY');
      });

      it('scores 0% when no hard skills appear in JD text', async () => {
        const saved = await runWithSkills(['Rust', 'Haskell'], 'We need Python and Java skills');
        expect(saved?.['surfaceScore']).toBe(0);
        expect(saved?.['overallAdvice']).toBe('SKIP');
      });

      it('scores 0% when there are no hard skills', async () => {
        const saved = await runWithSkills([], 'some text');
        expect(saved?.['surfaceScore']).toBe(0);
      });

      it('applies CAUTIOUS advice for 40-69% surface score', async () => {
        // 2/4 = 50% → CAUTIOUS
        const saved = await runWithSkills(['React', 'TypeScript', 'Python', 'Rust'], 'React TypeScript required');
        expect(saved?.['overallAdvice']).toBe('CAUTIOUS');
      });
    });

    describe('deep match scoring with embeddings', () => {
      it('clamps deep score to 0 when cosine similarity is negative', async () => {
        // Provide a material with embedding that would produce negative cosine similarity
        // Vector pointing opposite direction: JD=[1,0], material=[-1,0] → cosine=-1
        const parsedJd = {
          id: 'jd_01',
          captureId: 'cap_01',
          hardSkills: ['React'],
          company: null,
          jdEmbedding: [1, 0],
          title: 'Engineer',
        };
        const materials = [
          { id: 'm_01', shiningText: 'Some experience', tags: [], embedding: [-1, 0] },
        ];
        const { processor, captureRepo, jdRepo, matchRepo, materialManager } = buildProcessor();
        captureRepo.findOne.mockResolvedValue({ id: 'cap_01', capturedText: '' });
        jdRepo.findOne.mockResolvedValueOnce(parsedJd);
        matchRepo.findOne.mockResolvedValue(null);
        materialManager.confirmedForUser.mockResolvedValue(materials);

        await processor.process(makeBullJob({ captureId: 'cap_01', userId: 'u1' }));

        const saved = matchRepo.save.mock.calls[0][0] as Record<string, unknown>;
        expect(saved['deepScore']).toBeGreaterThanOrEqual(0);
      });

      it('uses fallback keyword matching when no embeddings available', async () => {
        const parsedJd = {
          id: 'jd_01',
          captureId: 'cap_01',
          hardSkills: ['React'],
          company: null,
          jdEmbedding: null,
          title: 'Engineer',
        };
        const materials = [{ id: 'm_01', shiningText: 'Built React apps', tags: [], embedding: null }];
        const { processor, captureRepo, jdRepo, matchRepo, materialManager } = buildProcessor();
        captureRepo.findOne.mockResolvedValue({ id: 'cap_01', capturedText: '' });
        jdRepo.findOne.mockResolvedValueOnce(parsedJd);
        matchRepo.findOne.mockResolvedValue(null);
        materialManager.confirmedForUser.mockResolvedValue(materials);

        await processor.process(makeBullJob({ captureId: 'cap_01', userId: 'u1' }));

        const saved = matchRepo.save.mock.calls[0][0] as Record<string, unknown>;
        expect(saved['deepScore']).toBeGreaterThan(0);
        expect((saved['hitsDeep'] as string[]).length).toBeGreaterThan(0);
      });
    });

    describe('company research', () => {
      it('fetches company info when no cached brief exists', async () => {
        const parsedJd = {
          id: 'jd_01',
          captureId: 'cap_01',
          hardSkills: [],
          company: 'Stripe',
          jdEmbedding: null,
          title: 'PM',
        };
        const companyBrief = {
          whatTheyDo: 'Payment infra',
          sizeStage: 'Large',
          recentNews: [],
          risks: { layoffs: false, regulatory: false },
          glassdoorRating: 4.2,
        };
        const { processor, captureRepo, jdRepo, companyRepo, llm } = buildProcessor();
        captureRepo.findOne.mockResolvedValue({ id: 'cap_01', capturedText: '' });
        jdRepo.findOne.mockResolvedValueOnce(parsedJd);
        // Only LLM call here is company research — JD is already parsed
        llm.structuredComplete.mockResolvedValue(companyBrief);

        await processor.process(makeBullJob({ captureId: 'cap_01', userId: 'u1' }));

        expect(companyRepo.save).toHaveBeenCalled();
        const saved = companyRepo.save.mock.calls[0][0] as Record<string, unknown>;
        expect(saved['company']).toBe('Stripe');
      });

      it('skips company fetch when cached brief is still valid', async () => {
        const parsedJd = {
          id: 'jd_01',
          captureId: 'cap_01',
          hardSkills: [],
          company: 'Stripe',
          jdEmbedding: null,
          title: 'PM',
        };
        const cachedBrief = {
          id: 'brief_01',
          company: 'Stripe',
          ttlExpires: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000), // 3 days from now
        };
        const { processor, captureRepo, jdRepo, companyRepo, llm } = buildProcessor();
        captureRepo.findOne.mockResolvedValue({ id: 'cap_01', capturedText: '' });
        jdRepo.findOne.mockResolvedValueOnce(parsedJd);
        companyRepo.findOne.mockResolvedValue(cachedBrief);

        await processor.process(makeBullJob({ captureId: 'cap_01', userId: 'u1' }));

        expect(companyRepo.save).not.toHaveBeenCalled();
      });

      it('refreshes expired company brief', async () => {
        const parsedJd = {
          id: 'jd_01',
          captureId: 'cap_01',
          hardSkills: [],
          company: 'Stripe',
          jdEmbedding: null,
          title: 'PM',
        };
        const expiredBrief = {
          id: 'brief_01',
          company: 'Stripe',
          ttlExpires: new Date(Date.now() - 1000), // expired
        };
        const { processor, captureRepo, jdRepo, companyRepo, llm } = buildProcessor();
        captureRepo.findOne.mockResolvedValue({ id: 'cap_01', capturedText: '' });
        jdRepo.findOne.mockResolvedValueOnce(parsedJd);
        companyRepo.findOne.mockResolvedValue(expiredBrief);
        llm.structuredComplete.mockResolvedValue({});

        await processor.process(makeBullJob({ captureId: 'cap_01', userId: 'u1' }));

        expect(companyRepo.save).toHaveBeenCalled();
      });
    });
  });

  describe('cosineSimilarity (private — tested via process)', () => {
    it('returns 1.0 for identical vectors', async () => {
      const vec = [0.5, 0.5, 0.5];
      const parsedJd = {
        id: 'jd_01',
        captureId: 'cap_01',
        hardSkills: ['React'],
        company: null,
        jdEmbedding: vec,
        title: 'Engineer',
      };
      const materials = [{ id: 'm_01', shiningText: 'React developer', tags: ['React'], embedding: vec }];
      const { processor, captureRepo, jdRepo, matchRepo, materialManager } = buildProcessor();
      captureRepo.findOne.mockResolvedValue({ id: 'cap_01', capturedText: '' });
      jdRepo.findOne.mockResolvedValueOnce(parsedJd);
      matchRepo.findOne.mockResolvedValue(null);
      materialManager.confirmedForUser.mockResolvedValue(materials);

      await processor.process(makeBullJob({ captureId: 'cap_01', userId: 'u1' }));

      const saved = matchRepo.save.mock.calls[0][0] as Record<string, unknown>;
      // deepScore = round(1.0 * 100) = 100
      expect(saved['deepScore']).toBe(100);
    });

    it('returns 0 for zero vectors', async () => {
      const parsedJd = {
        id: 'jd_01',
        captureId: 'cap_01',
        hardSkills: [],
        company: null,
        jdEmbedding: [0, 0, 0],
        title: 'Engineer',
      };
      const materials = [{ id: 'm_01', shiningText: 'text', tags: [], embedding: [0, 0, 0] }];
      const { processor, captureRepo, jdRepo, matchRepo, materialManager } = buildProcessor();
      captureRepo.findOne.mockResolvedValue({ id: 'cap_01', capturedText: '' });
      jdRepo.findOne.mockResolvedValueOnce(parsedJd);
      matchRepo.findOne.mockResolvedValue(null);
      materialManager.confirmedForUser.mockResolvedValue(materials);

      await processor.process(makeBullJob({ captureId: 'cap_01', userId: 'u1' }));

      const saved = matchRepo.save.mock.calls[0][0] as Record<string, unknown>;
      expect(saved['deepScore']).toBe(0);
    });
  });
});
