// FILE: test/unit/agent/draft-motivation.tool.spec.ts
import { vi } from 'vitest';
import { DraftMotivationTool } from '../../../src/agent/tools/draft-motivation.tool.js';

const makeJd = (overrides: Record<string, unknown> = {}) =>
  ({
    id: 'jd_01',
    title: 'Senior Product Manager',
    company: 'Stripe',
    hardSkills: ['product strategy', 'roadmapping', 'data analysis', 'SQL', 'stakeholder management'],
    ...overrides,
  }) as any;

function buildTool() {
  const jdRepo = {
    findOne: vi.fn().mockResolvedValue(null),
  };
  const llm = {
    completeContext: vi
      .fn()
      .mockResolvedValue(
        "I'm drawn to Stripe's infrastructure mission and the challenge of building tools developers actually love.",
      ),
  };

  const tool = new DraftMotivationTool(jdRepo as any, llm as any);
  return { tool, jdRepo, llm };
}

const params = { parsed_jd_id: 'jd_01' };

describe('DraftMotivationTool', () => {
  describe('execute', () => {
    it('returns not found message when jdRepo.findOne returns null', async () => {
      const { tool } = buildTool();

      const result = await tool.execute('tc_01', params);

      expect(result.content[0].text.toLowerCase()).toMatch(/not found|could not find/);
    });

    it('calls llm.completeContext when JD exists', async () => {
      const { tool, jdRepo, llm } = buildTool();
      jdRepo.findOne.mockResolvedValue(makeJd());

      await tool.execute('tc_01', params);

      expect(llm.completeContext).toHaveBeenCalled();
    });

    it('result.details has draft and parsedJdId on success', async () => {
      const { tool, jdRepo } = buildTool();
      jdRepo.findOne.mockResolvedValue(makeJd());

      const result = await tool.execute('tc_01', params);

      expect(result.details).toHaveProperty('draft');
      expect(result.details).toHaveProperty('parsedJdId', 'jd_01');
    });

    it('result.content[0].text contains LLM draft text', async () => {
      const { tool, jdRepo } = buildTool();
      jdRepo.findOne.mockResolvedValue(makeJd());

      const result = await tool.execute('tc_01', params);

      expect(result.content[0].text).toContain("Stripe's infrastructure mission");
    });

    it('includes profile_summary in llm prompt when provided', async () => {
      const { tool, jdRepo, llm } = buildTool();
      jdRepo.findOne.mockResolvedValue(makeJd());

      await tool.execute('tc_01', {
        parsed_jd_id: 'jd_01',
        profile_summary: '5 years PM at fintech startups',
      });

      const promptContent = llm.completeContext.mock.calls[0][0].messages[0].content as string;
      expect(promptContent).toContain('5 years PM at fintech startups');
    });

    it('does NOT include profile_summary line in prompt when not provided', async () => {
      const { tool, jdRepo, llm } = buildTool();
      jdRepo.findOne.mockResolvedValue(makeJd());

      await tool.execute('tc_01', params);

      const promptContent = llm.completeContext.mock.calls[0][0].messages[0].content as string;
      expect(promptContent).not.toContain('Candidate background');
    });

    it('details.draft matches trimmed LLM output', async () => {
      const { tool, jdRepo, llm } = buildTool();
      jdRepo.findOne.mockResolvedValue(makeJd());
      llm.completeContext.mockResolvedValue('  Specific motivation text here.  ');

      const result = await tool.execute('tc_01', params);

      expect(result.details['draft']).toBe('Specific motivation text here.');
    });
  });
});
