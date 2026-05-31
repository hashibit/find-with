/**
 * Integration test: TailoringProcessor against a real PostgreSQL DB.
 *
 * LLM is mocked — the integration value here is the real DB reads/writes:
 *   - Idempotency guard (skip if sections already populated) reads from DB.
 *   - Processor writes validated sections back to tailoring_resumes.
 *   - MaterialManager.forTailoring reads from profile_materials.
 */
import { DataSource, Repository } from 'typeorm';
import { vi, beforeAll, afterAll, beforeEach, afterEach, describe, it, expect } from 'vitest';
import { Job } from 'bullmq';
import { TailoringProcessor } from '../../src/contexts/tailoring/tailoring.processor.js';
import { MaterialManager } from '../../src/contexts/profile/material-manager.service.js';
import { TailoringResume } from '../../src/database/entities/tailoring/tailoring-resume.entity.js';
import { JobParsedJd } from '../../src/database/entities/jobs/parsed-jd.entity.js';
import { ProfileBaseResume } from '../../src/database/entities/profile/base-resume.entity.js';
import { ProfileMaterial } from '../../src/database/entities/profile/material.entity.js';
import { ALL_ENTITIES } from '../../src/database/database.module.js';
import { ulid } from 'ulid';

const USER = 'int_test_user_tailoring';

// Minimal LLM mock — returns one confirmed bullet
const mockLlm = {
  completeContext: vi.fn().mockResolvedValue(
    JSON.stringify([
      {
        title: 'Work Experience',
        bullets: [
          {
            id: `bullet_${ulid()}`,
            text: 'Led platform migration reducing latency by 40%',
            source: 'MATERIAL',
            sourceId: null, // populated per-test
            status: 'CONFIRMED',
          },
        ],
      },
    ]),
  ),
};

let ds: DataSource;
let resumeRepo: Repository<TailoringResume>;
let jdRepo: Repository<JobParsedJd>;
let baseResumeRepo: Repository<ProfileBaseResume>;
let materialRepo: Repository<ProfileMaterial>;
let processor: TailoringProcessor;

const makeJob = (data: { tailoredResumeId: string; userId: string }) =>
  ({ data } as Job<{ tailoredResumeId: string; userId: string }>);

beforeAll(async () => {
  ds = new DataSource({
    type: 'postgres',
    url: process.env.DATABASE_URL,
    entities: ALL_ENTITIES,
    synchronize: false,
    logging: false,
  });
  await ds.initialize();

  resumeRepo = ds.getRepository(TailoringResume);
  jdRepo = ds.getRepository(JobParsedJd);
  baseResumeRepo = ds.getRepository(ProfileBaseResume);
  materialRepo = ds.getRepository(ProfileMaterial);

  const materialManager = new MaterialManager(materialRepo);

  processor = new TailoringProcessor(
    resumeRepo,
    jdRepo,
    baseResumeRepo,
    mockLlm as any,
    materialManager,
  );
});

afterAll(async () => {
  await ds.destroy();
});

beforeEach(async () => {
  vi.clearAllMocks();
});

afterEach(async () => {
  // Delete in dependency order
  await resumeRepo.delete({ userId: USER });
  await jdRepo
    .createQueryBuilder()
    .delete()
    .where('"captureId" IN (SELECT id FROM job_captures WHERE "userId" = :userId)', { userId: USER })
    .execute()
    .catch(() => {}); // table may not have matching rows
  await baseResumeRepo.delete({ userId: USER });
  await materialRepo.delete({ userId: USER });
});

describe('TailoringProcessor — integration', () => {
  it('returns early without touching DB when tailored resume does not exist', async () => {
    await expect(
      processor.process(makeJob({ tailoredResumeId: 'nonexistent_id', userId: USER })),
    ).resolves.not.toThrow();
    expect(mockLlm.completeContext).not.toHaveBeenCalled();
  });

  it('skips LLM generation when sections already populated (idempotency)', async () => {
    const resume = await resumeRepo.save(
      resumeRepo.create({
        id: ulid(),
        userId: USER,
        baseResumeId: 'br_01',
        parsedJdId: 'jd_01',
        sections: [{ title: 'Experience', bullets: [{ id: 'b_01', text: 'existing' }] }],
      }),
    );

    await processor.process(makeJob({ tailoredResumeId: resume.id, userId: USER }));
    expect(mockLlm.completeContext).not.toHaveBeenCalled();
  });

  it('returns early when parsedJd or baseResume is missing', async () => {
    const resume = await resumeRepo.save(
      resumeRepo.create({
        id: ulid(),
        userId: USER,
        baseResumeId: 'br_missing',
        parsedJdId: 'jd_missing',
        sections: [],
      }),
    );

    await processor.process(makeJob({ tailoredResumeId: resume.id, userId: USER }));
    expect(mockLlm.completeContext).not.toHaveBeenCalled();
  });

  it('calls LLM and writes sections to DB when all dependencies exist', async () => {
    const material = await materialRepo.save(
      materialRepo.create({
        id: ulid(),
        userId: USER,
        shiningText: 'Led platform migration',
        tags: ['leadership', 'infra'],
        provenanceKind: 'conversation',
        status: 'CONFIRMED',
        rawText: null,
      }),
    );

    const baseResume = await baseResumeRepo.save(
      baseResumeRepo.create({
        id: ulid(),
        userId: USER,
        name: 'Test Resume',
        selectedMaterialIds: null,
        isDefault: true,
      }),
    );

    const parsedJd = await jdRepo.save(
      jdRepo.create({
        id: ulid(),
        captureId: ulid(),
        title: 'Senior Engineer',
        company: 'Stripe',
        hardSkills: ['TypeScript', 'PostgreSQL'],
      } as Partial<JobParsedJd> as any),
    );

    // Point LLM mock sourceId at our real material
    mockLlm.completeContext.mockResolvedValueOnce(
      JSON.stringify([
        {
          title: 'Work Experience',
          bullets: [
            {
              id: ulid(),
              text: 'Led platform migration reducing latency by 40%',
              source: 'MATERIAL',
              sourceId: material.id,
              status: 'CONFIRMED',
            },
          ],
        },
      ]),
    );

    const resume = await resumeRepo.save(
      resumeRepo.create({
        id: ulid(),
        userId: USER,
        baseResumeId: baseResume.id,
        parsedJdId: parsedJd.id,
        sections: [],
      }),
    );

    await processor.process(makeJob({ tailoredResumeId: resume.id, userId: USER }));

    expect(mockLlm.completeContext).toHaveBeenCalledOnce();

    const saved = await resumeRepo.findOne({ where: { id: resume.id } });
    expect(saved!.sections).not.toHaveLength(0);
    const bullets = (saved!.sections as any[])[0].bullets as any[];
    expect(bullets[0].status).toBe('CONFIRMED');
    expect(bullets[0].sourceId).toBe(material.id);
  });
});
