// FILE: test/unit/profile/profile.processor.spec.ts
import { vi, type MockedObject } from 'vitest';
import { ProfileProcessor } from '../../../src/contexts/profile/profile.processor.js';

/**
 * The DB invariant under test: work_experience.start/end and education.start/end
 * are varchar(7) and MUST hold 'YYYY-MM' or null. The LLM is free-form, so the
 * processor normalizes before save; anything unparseable becomes null instead of
 * a failed insert (which used to fail the entire resume parse).
 */

function buildProcessor(llmResult: unknown) {
  const makeRepo = () => ({
    findOne: vi.fn().mockResolvedValue(null),
    create: vi.fn((x: unknown) => x),
    save: vi.fn().mockResolvedValue(undefined),
    upsert: vi.fn().mockResolvedValue(undefined),
  });
  const sourceRepo = {
    findOne: vi.fn().mockResolvedValue({
      id: 'src_01',
      blobUri: 's3://bucket/resume.pdf',
      contentType: 'application/pdf',
      filename: 'resume.pdf',
      parseStatus: 'PENDING',
    }),
    save: vi.fn().mockResolvedValue(undefined),
  };
  const repos = {
    profile: makeRepo(),
    edu: makeRepo(),
    exp: makeRepo(),
    skill: makeRepo(),
    baseResume: makeRepo(),
  };

  const processor = new ProfileProcessor(
    sourceRepo as never,
    repos.profile as never,
    repos.edu as never,
    repos.exp as never,
    repos.skill as never,
    repos.baseResume as never,
    { download: vi.fn().mockResolvedValue(new TextEncoder().encode('resume text')) } as never,
    { structuredComplete: vi.fn().mockResolvedValue(llmResult) } as never,
  );

  // pdf text extraction would need the real unpdf — swap the extractor out by
  // stubbing the module import through the prototype (processor calls extractText).
  return { processor, repos };
}

vi.mock('unpdf', () => ({
  extractText: vi.fn().mockResolvedValue({ text: 'resume text', totalPages: 1 }),
}));

vi.mock('../../../src/contexts/profile/profile.service.js', () => ({
  RESUME_PARSE_QUEUE: 'resume-parse',
}));

type Created = { start?: string | null; end?: string | null; isCurrent?: boolean; isCurrentlyEnrolled?: boolean };

describe('ProfileProcessor date normalization', () => {
  it('normalizes free-form dates and derives isCurrent for "Present" ends', async () => {
    const { processor, repos } = buildProcessor({
      basicInfo: {},
      education: [
        { school: 'UC', degree: 'BS', start: '2014', end: '2018-5-2', isCurrentlyEnrolled: undefined },
      ],
      workExperience: [
        {
          company: 'Stripe',
          title: 'PM',
          start: 'March 2020',
          end: 'Present',
          bullets: [],
        },
        {
          company: 'Linear',
          title: 'PM',
          start: '2019.6',
          end: '2020.2',
          bullets: [],
        },
      ],
      skills: [{ name: 'SQL', kind: 'HARD' }],
    });

    await processor.process({ data: { sourceId: 'src_01', userId: 'u_01' } } as never);

    const expSaved = (repos.exp.save as unknown as MockedObject<typeof repos.exp.save>).mock.calls[0]![0] as unknown as Array<Record<string, unknown>>;
    expect(expSaved[0]).toMatchObject({
      start: '2020-03',
      end: null,
      isCurrent: true, // derived from "Present"
    });
    expect(expSaved[1]).toMatchObject({
      start: '2019-06',
      end: '2020-02',
      isCurrent: false,
    });

    const eduSaved = (repos.edu.save as unknown as MockedObject<typeof repos.edu.save>).mock.calls[0]![0] as unknown as Array<Record<string, unknown>>;
    expect(eduSaved[0]).toMatchObject({
      start: '2014-01', // year-only convention
      end: '2018-05',
      isCurrentlyEnrolled: false,
    });
  });

  it('keeps garbage dates out of the DB (null) instead of failing the parse', async () => {
    const { processor, repos } = buildProcessor({
      basicInfo: {},
      education: [],
      workExperience: [
        { company: 'X', title: 'Eng', start: 'unknown-ish long garbage', end: '', bullets: [] },
      ],
      skills: [],
    });

    await processor.process({ data: { sourceId: 'src_01', userId: 'u_01' } } as never);

    const expSaved = (repos.exp.save as unknown as MockedObject<typeof repos.exp.save>).mock.calls[0]![0] as unknown as Array<Record<string, unknown>>;
    expect(expSaved[0]).toMatchObject({ start: null, end: null });
  });

  it('an explicit isCurrent from the LLM wins over end-date derivation', async () => {
    const { processor, repos } = buildProcessor({
      basicInfo: {},
      education: [],
      workExperience: [
        { company: 'X', title: 'Eng', start: '2020-01', end: null, isCurrent: false, bullets: [] },
      ],
      skills: [],
    });

    await processor.process({ data: { sourceId: 'src_01', userId: 'u_01' } } as never);

    const expSaved = (repos.exp.save as unknown as MockedObject<typeof repos.exp.save>).mock.calls[0]![0] as unknown as Array<Record<string, unknown>>;
    expect(expSaved[0]).toMatchObject({ end: null, isCurrent: false });
  });
});
