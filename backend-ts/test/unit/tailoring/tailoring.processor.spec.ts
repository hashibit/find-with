import { describe, it, expect, vi } from 'vitest';
import { TailoringProcessor } from '../../../src/contexts/tailoring/tailoring.processor.js';
import type { Job } from 'bullmq';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makeBullJob = (data: { tailoredResumeId: string; userId: string }) =>
  ({ data } as unknown as Job<{ tailoredResumeId: string; userId: string }>);

const makeResumeRepo = () => ({
  findOne: vi.fn(),
  save: vi.fn().mockImplementation((e) => Promise.resolve(e)),
});

const makeBulletRepo = () => ({
  count: vi.fn().mockResolvedValue(0),
  create: vi.fn().mockImplementation((e) => e),
  save: vi.fn().mockImplementation((e) => Promise.resolve(e)),
});

const makeJdRepo = () => ({
  findOne: vi.fn(),
});

const makeBaseResumeRepo = () => ({
  findOne: vi.fn(),
});

const makeLlm = () => ({
  completeContext: vi.fn(),
});

const makeMaterialManager = () => ({
  forTailoring: vi.fn().mockResolvedValue([]),
});

function buildProcessor(overrides: Partial<{
  resumeRepo: ReturnType<typeof makeResumeRepo>;
  bulletRepo: ReturnType<typeof makeBulletRepo>;
  jdRepo: ReturnType<typeof makeJdRepo>;
  baseResumeRepo: ReturnType<typeof makeBaseResumeRepo>;
  llm: ReturnType<typeof makeLlm>;
  materialManager: ReturnType<typeof makeMaterialManager>;
}> = {}) {
  const resumeRepo = overrides.resumeRepo ?? makeResumeRepo();
  const bulletRepo = overrides.bulletRepo ?? makeBulletRepo();
  const jdRepo = overrides.jdRepo ?? makeJdRepo();
  const baseResumeRepo = overrides.baseResumeRepo ?? makeBaseResumeRepo();
  const llm = overrides.llm ?? makeLlm();
  const materialManager = overrides.materialManager ?? makeMaterialManager();

  const processor = new TailoringProcessor(
    resumeRepo as any,
    bulletRepo as any,
    jdRepo as any,
    baseResumeRepo as any,
    llm as any,
    materialManager as any,
  );

  return { processor, resumeRepo, bulletRepo, jdRepo, baseResumeRepo, llm, materialManager };
}

const BASE_TAILORED_RESUME = {
  id: 'tr_01',
  userId: 'u1',
  parsedJdId: 'jd_01',
  baseResumeId: 'br_01',
};

const BASE_JD = {
  id: 'jd_01',
  title: 'Senior PM',
  company: 'Stripe',
  hardSkills: ['React', 'TypeScript'],
};

const BASE_RESUME = {
  id: 'br_01',
  selectedMaterialIds: ['m_01', 'm_02'],
};

const MATERIALS = [
  { id: 'm_01', shiningText: 'Led React migration', tags: ['React', 'leadership'] },
  { id: 'm_02', shiningText: 'Built TypeScript SDK', tags: ['TypeScript'] },
];

function makeLlmSectionsResponse(bullets: Array<{
  id?: string;
  text: string;
  source?: string;
  sourceId?: string;
  status?: string;
}>) {
  return JSON.stringify([{
    title: 'Work Experience',
    bullets: bullets.map((b, i) => ({
      id: b.id ?? `bullet_${i}`,
      text: b.text,
      source: b.source ?? 'MATERIAL',
      sourceId: b.sourceId,
      status: b.status ?? 'CONFIRMED',
    })),
  }]);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TailoringProcessor', () => {
  describe('process() — early-exit guards', () => {
    it('returns early when tailored resume does not exist', async () => {
      const { processor, resumeRepo, llm } = buildProcessor();
      resumeRepo.findOne.mockResolvedValue(null);

      await processor.process(makeBullJob({ tailoredResumeId: 'tr_missing', userId: 'u1' }));

      expect(llm.completeContext).not.toHaveBeenCalled();
    });

    it('skips generation when bullets already exist (idempotent)', async () => {
      const { processor, resumeRepo, bulletRepo, llm } = buildProcessor();
      resumeRepo.findOne.mockResolvedValue({ ...BASE_TAILORED_RESUME });
      // Simulate pre-existing bullet rows
      bulletRepo.count.mockResolvedValue(3);

      await processor.process(makeBullJob({ tailoredResumeId: 'tr_01', userId: 'u1' }));

      expect(llm.completeContext).not.toHaveBeenCalled();
    });

    it('returns early when parsedJd is missing', async () => {
      const { processor, resumeRepo, bulletRepo, jdRepo, baseResumeRepo, llm } = buildProcessor();
      resumeRepo.findOne.mockResolvedValue(BASE_TAILORED_RESUME);
      bulletRepo.count.mockResolvedValue(0);
      jdRepo.findOne.mockResolvedValue(null);
      baseResumeRepo.findOne.mockResolvedValue(BASE_RESUME);

      await processor.process(makeBullJob({ tailoredResumeId: 'tr_01', userId: 'u1' }));

      expect(llm.completeContext).not.toHaveBeenCalled();
    });

    it('returns early when baseResume is missing', async () => {
      const { processor, resumeRepo, bulletRepo, jdRepo, baseResumeRepo, llm } = buildProcessor();
      resumeRepo.findOne.mockResolvedValue(BASE_TAILORED_RESUME);
      bulletRepo.count.mockResolvedValue(0);
      jdRepo.findOne.mockResolvedValue(BASE_JD);
      baseResumeRepo.findOne.mockResolvedValue(null);

      await processor.process(makeBullJob({ tailoredResumeId: 'tr_01', userId: 'u1' }));

      expect(llm.completeContext).not.toHaveBeenCalled();
    });
  });

  describe('process() — bullet validation', () => {
    function setup() {
      const { processor, resumeRepo, bulletRepo, jdRepo, baseResumeRepo, llm, materialManager } = buildProcessor();
      resumeRepo.findOne.mockResolvedValue({ ...BASE_TAILORED_RESUME });
      bulletRepo.count.mockResolvedValue(0);
      jdRepo.findOne.mockResolvedValue({ ...BASE_JD });
      baseResumeRepo.findOne.mockResolvedValue({ ...BASE_RESUME });
      materialManager.forTailoring.mockResolvedValue(MATERIALS);
      return { processor, resumeRepo, bulletRepo, llm };
    }

    it('marks bullet CONFIRMED when sourceId references a valid material', async () => {
      const { processor, bulletRepo, llm } = setup();
      llm.completeContext.mockResolvedValue(
        makeLlmSectionsResponse([{ text: 'Led React migration at scale', sourceId: 'm_01', status: 'CONFIRMED' }]),
      );

      await processor.process(makeBullJob({ tailoredResumeId: 'tr_01', userId: 'u1' }));

      const savedBullets = bulletRepo.save.mock.calls[0][0] as Array<{ status: string; sourceId: string }>;
      expect(savedBullets[0].status).toBe('CONFIRMED');
      expect(savedBullets[0].sourceId).toBe('m_01');
    });

    it('marks bullet PENDING when LLM marks PENDING despite valid sourceId (trust the model)', async () => {
      const { processor, bulletRepo, llm } = setup();
      llm.completeContext.mockResolvedValue(
        makeLlmSectionsResponse([{ text: 'Some bullet', sourceId: 'm_01', status: 'PENDING' }]),
      );

      await processor.process(makeBullJob({ tailoredResumeId: 'tr_01', userId: 'u1' }));

      const savedBullets = bulletRepo.save.mock.calls[0][0] as Array<{ status: string }>;
      expect(savedBullets[0].status).toBe('PENDING');
    });

    it('marks bullet PENDING when sourceId is absent (LLM fabricated)', async () => {
      const { processor, bulletRepo, llm } = setup();
      llm.completeContext.mockResolvedValue(
        makeLlmSectionsResponse([{ text: 'Made up achievement', sourceId: undefined, status: 'CONFIRMED' }]),
      );

      await processor.process(makeBullJob({ tailoredResumeId: 'tr_01', userId: 'u1' }));

      const savedBullets = bulletRepo.save.mock.calls[0][0] as Array<{ status: string }>;
      expect(savedBullets[0].status).toBe('PENDING');
    });

    it('marks bullet PENDING when sourceId does not match any confirmed material', async () => {
      const { processor, bulletRepo, llm } = setup();
      llm.completeContext.mockResolvedValue(
        makeLlmSectionsResponse([{ text: 'Some bullet', sourceId: 'm_nonexistent', status: 'CONFIRMED' }]),
      );

      await processor.process(makeBullJob({ tailoredResumeId: 'tr_01', userId: 'u1' }));

      const savedBullets = bulletRepo.save.mock.calls[0][0] as Array<{ status: string }>;
      expect(savedBullets[0].status).toBe('PENDING');
    });

    it('handles multiple bullets with mixed validation outcomes', async () => {
      const { processor, bulletRepo, llm } = setup();
      llm.completeContext.mockResolvedValue(
        makeLlmSectionsResponse([
          { text: 'Valid bullet', sourceId: 'm_01', status: 'CONFIRMED' },
          { text: 'Fabricated bullet', sourceId: undefined, status: 'CONFIRMED' },
          { text: 'LLM uncertain', sourceId: 'm_02', status: 'PENDING' },
        ]),
      );

      await processor.process(makeBullJob({ tailoredResumeId: 'tr_01', userId: 'u1' }));

      const savedBullets = bulletRepo.save.mock.calls[0][0] as Array<{ status: string }>;
      expect(savedBullets[0].status).toBe('CONFIRMED');
      expect(savedBullets[1].status).toBe('PENDING');
      expect(savedBullets[2].status).toBe('PENDING');
    });

    it('handles malformed LLM JSON gracefully (saves empty bullets)', async () => {
      const { processor, bulletRepo, llm } = setup();
      llm.completeContext.mockResolvedValue('not valid json');

      await processor.process(makeBullJob({ tailoredResumeId: 'tr_01', userId: 'u1' }));

      // bulletRepo.save should be called with an empty array
      const savedBullets = bulletRepo.save.mock.calls[0][0] as unknown[];
      expect(savedBullets).toEqual([]);
    });

    it('persists the tailored resume after processing', async () => {
      const { processor, resumeRepo, llm } = setup();
      llm.completeContext.mockResolvedValue(
        makeLlmSectionsResponse([{ text: 'Valid bullet', sourceId: 'm_01', status: 'CONFIRMED' }]),
      );

      await processor.process(makeBullJob({ tailoredResumeId: 'tr_01', userId: 'u1' }));

      // resumeRepo.save is called once (to persist matchBefore/matchAfter)
      expect(resumeRepo.save).toHaveBeenCalledTimes(1);
    });

    it('assigns a ULID to bullets missing an id', async () => {
      const { processor, bulletRepo, llm } = setup();
      llm.completeContext.mockResolvedValue(
        JSON.stringify([{
          title: 'Experience',
          bullets: [{ text: 'No id bullet', source: 'MATERIAL', sourceId: 'm_01', status: 'CONFIRMED' }],
        }]),
      );

      await processor.process(makeBullJob({ tailoredResumeId: 'tr_01', userId: 'u1' }));

      const savedBullets = bulletRepo.save.mock.calls[0][0] as Array<{ id: string }>;
      expect(savedBullets[0].id).toBeTruthy();
      expect(typeof savedBullets[0].id).toBe('string');
    });

    it('sets sectionTitle and position on each bullet entity', async () => {
      const { processor, bulletRepo, llm } = setup();
      llm.completeContext.mockResolvedValue(
        makeLlmSectionsResponse([
          { text: 'First bullet', sourceId: 'm_01', status: 'CONFIRMED' },
          { text: 'Second bullet', sourceId: 'm_02', status: 'CONFIRMED' },
        ]),
      );

      await processor.process(makeBullJob({ tailoredResumeId: 'tr_01', userId: 'u1' }));

      const savedBullets = bulletRepo.save.mock.calls[0][0] as Array<{
        sectionTitle: string;
        position: number;
        resumeId: string;
      }>;
      expect(savedBullets[0].sectionTitle).toBe('Work Experience');
      expect(savedBullets[0].position).toBe(0);
      expect(savedBullets[0].resumeId).toBe('tr_01');
      expect(savedBullets[1].position).toBe(1);
    });
  });
});
