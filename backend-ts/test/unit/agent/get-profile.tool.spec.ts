// FILE: test/unit/agent/get-profile.tool.spec.ts
import { vi } from 'vitest';
import { GetProfileTool } from '../../../src/agent/tools/get-profile.tool.js';

function buildTool(profile: unknown, work: unknown[] = [], edu: unknown[] = [], skills: unknown[] = []) {
  const profileRepo = { findOne: vi.fn().mockResolvedValue(profile) };
  const workExpRepo = { find: vi.fn().mockResolvedValue(work) };
  const educationRepo = { find: vi.fn().mockResolvedValue(edu) };
  const skillRepo = { find: vi.fn().mockResolvedValue(skills) };
  const tool = new GetProfileTool(
    profileRepo as any,
    workExpRepo as any,
    educationRepo as any,
    skillRepo as any,
  );
  return { tool, profileRepo, workExpRepo, educationRepo, skillRepo };
}

const ctx = { userId: 'user_01', conversationId: 'conv_01' };

describe('GetProfileTool', () => {
  it('is registered for all conversation kinds', () => {
    const { tool } = buildTool(null);
    expect(tool.scenes).toContain('ALL');
    expect(tool.name).toBe('get_profile');
  });

  it('reports missing profile without throwing', async () => {
    const { tool, workExpRepo } = buildTool(null);

    const result = await tool.execute('tc_01', {}, ctx);

    expect(result.details).toEqual({ found: false });
    expect(result.content[0].text).toContain('No profile found');
    expect(workExpRepo.find).not.toHaveBeenCalled();
  });

  it('returns work experience bullets and skills in the text output', async () => {
    const { tool } = buildTool(
      { basicInfo: { fullName: 'Ada', email: 'ada@test.dev' }, certifications: null },
      [
        {
          company: 'Stripe',
          title: 'Senior PM',
          start: '2022-01',
          end: null,
          isCurrent: true,
          isRemote: false,
          employmentType: 'FULL_TIME',
          location: 'SF',
          bullets: ['Led billing rewrite', 'Cut churn 12%'],
        },
      ],
      [],
      [
        { name: 'TypeScript', kind: 'HARD' },
        { name: 'Figma', kind: 'TOOL' },
      ],
    );

    const result = await tool.execute('tc_01', {}, ctx);
    const text = result.content[0].text;

    expect(result.details).toMatchObject({
      found: true,
      counts: { workExperience: 1, education: 0, skills: 2, certifications: 0 },
    });
    expect(text).toContain('fullName: Ada');
    expect(text).toContain('Senior PM @ Stripe (2022-01 → present)');
    expect(text).toContain('  - Led billing rewrite');
    expect(text).toContain('HARD: TypeScript');
  });

  it('marks unknown end dates as ? when not current', async () => {
    const { tool } = buildTool(
      { basicInfo: null },
      [{ company: 'X', title: 'Eng', start: '2020-01', end: null, isCurrent: false, isRemote: null, employmentType: null, location: null, bullets: null }],
      [],
      [],
    );

    const result = await tool.execute('tc_01', {}, ctx);
    expect(result.content[0].text).toContain('(2020-01 → ?)');
  });

  it('queries all repos scoped to the requesting user', async () => {
    const { tool, profileRepo, workExpRepo, educationRepo, skillRepo } = buildTool({ basicInfo: null });

    await tool.execute('tc_01', {}, ctx);

    expect(profileRepo.findOne).toHaveBeenCalledWith({ where: { userId: 'user_01' } });
    expect(workExpRepo.find).toHaveBeenCalledWith({ where: { userId: 'user_01' }, order: { createdAt: 'DESC' } });
    expect(educationRepo.find).toHaveBeenCalledWith({ where: { userId: 'user_01' }, order: { createdAt: 'DESC' } });
    expect(skillRepo.find).toHaveBeenCalledWith({ where: { userId: 'user_01' }, order: { createdAt: 'DESC' } });
  });
});
