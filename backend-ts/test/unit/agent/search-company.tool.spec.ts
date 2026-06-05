// FILE: test/unit/agent/search-company.tool.spec.ts
import { vi } from 'vitest';
import { SearchCompanyTool } from '../../../src/agent/tools/search-company.tool.js';

const makeBrief = (overrides: Record<string, unknown> = {}) =>
  ({
    id: 'brief_01',
    company: 'Acme Corp',
    whatTheyDo: 'Makes anvils.',
    sizeStage: 'Series B, ~200 employees',
    glassdoorRating: 4.1,
    recentNews: ['Raised $30M Series B'],
    risks: { layoffs: false, regulatory: false, culture: 'Good' },
    ttlExpires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    ...overrides,
  }) as any;

function buildTool() {
  const repo = {
    findOne: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockImplementation((data) => ({ ...data })),
    save: vi.fn().mockImplementation(async (entity) => entity),
  };
  const llm = {
    completeContext: vi
      .fn()
      .mockResolvedValue(
        '{"whatTheyDo":"Makes anvils.","sizeStage":"Series B","recentNews":["Raised $30M"],"risks":{"layoffs":false},"glassdoorRating":4.1}',
      ),
  };

  const tool = new SearchCompanyTool(repo as any, llm as any);
  return { tool, repo, llm };
}

const params = { company: 'Acme Corp' };

describe('SearchCompanyTool', () => {
  describe('execute', () => {
    it('calls llm.completeContext and repo.save when no cache exists', async () => {
      const { tool, repo, llm } = buildTool();
      repo.findOne.mockResolvedValue(null);

      await tool.execute('tc_01', params);

      expect(llm.completeContext).toHaveBeenCalled();
      expect(repo.save).toHaveBeenCalled();
    });

    it('does NOT call llm when a valid cached brief exists (ttlExpires in future)', async () => {
      const { tool, repo, llm } = buildTool();
      repo.findOne.mockResolvedValue(makeBrief());

      await tool.execute('tc_01', params);

      expect(llm.completeContext).not.toHaveBeenCalled();
    });

    it('calls llm again when cache is expired (ttlExpires in past)', async () => {
      const { tool, repo, llm } = buildTool();
      repo.findOne.mockResolvedValue(
        makeBrief({ ttlExpires: new Date(Date.now() - 1000) }),
      );

      await tool.execute('tc_01', params);

      expect(llm.completeContext).toHaveBeenCalled();
    });

    it('result.details has companyBriefId and company', async () => {
      const { tool, repo } = buildTool();
      repo.findOne.mockResolvedValue(null);
      repo.create.mockReturnValue({ id: 'brief_new' });
      repo.save.mockImplementation(async (e) => e);

      const result = await tool.execute('tc_01', params);

      expect(result.details).toHaveProperty('company', 'Acme Corp');
      expect(result.details).toHaveProperty('companyBriefId');
    });

    it('result.content[0].text contains the company name', async () => {
      const { tool, repo } = buildTool();
      repo.findOne.mockResolvedValue(makeBrief());

      const result = await tool.execute('tc_01', params);

      expect(result.content[0].text).toContain('Acme Corp');
    });

    it('result.details includes sizeStage and glassdoorRating from LLM', async () => {
      const { tool, repo } = buildTool();
      repo.findOne.mockResolvedValue(null);
      repo.create.mockReturnValue({ id: 'brief_new' });
      repo.save.mockImplementation(async (e) => e);

      const result = await tool.execute('tc_01', params);

      expect(result.details).toHaveProperty('sizeStage', 'Series B');
      expect(result.details).toHaveProperty('glassdoorRating', 4.1);
    });

    it('result.details.risks is populated from LLM response', async () => {
      const { tool, repo } = buildTool();
      repo.findOne.mockResolvedValue(null);
      repo.create.mockReturnValue({ id: 'brief_new' });
      repo.save.mockImplementation(async (e) => e);

      const result = await tool.execute('tc_01', params);

      expect(result.details).toHaveProperty('risks');
    });
  });
});
