// FILE: test/unit/agent/farewell-tool.spec.ts
import { vi } from 'vitest';
import { FarewellTool } from '../../../src/agent/tools/farewell.tool.js';

const makeRadarItem = (status: string) => ({ id: 'r_01', userId: 'u_01', status }) as any;
const makeMaterial = () =>
  ({ id: 'm_01', shiningText: 'Led a project', status: 'CONFIRMED' }) as any;

function buildTool() {
  const radarRepo = {
    find: vi.fn().mockResolvedValue([]),
    update: vi.fn().mockResolvedValue(undefined),
  };
  const materialRepo = {
    find: vi.fn().mockResolvedValue([]),
  };
  const llm = {
    completeContext: vi
      .fn()
      .mockResolvedValue('{"farewellMessage":"Congrats","recapMarkdown":"# Recap"}'),
  };

  const tool = new FarewellTool(radarRepo as any, materialRepo as any, llm as any);
  return { tool, radarRepo, materialRepo, llm };
}

const ctx = { userId: 'u_01', conversationId: 'conv_01' };
const params = { radar_item_id: 'r_01' };

describe('FarewellTool', () => {
  describe('execute', () => {
    it('calls radarRepo.update with status OFFER_ACCEPTED', async () => {
      const { tool, radarRepo } = buildTool();

      await tool.execute('tc_01', params, ctx);

      expect(radarRepo.update).toHaveBeenCalledWith(
        { id: 'r_01' },
        { status: 'OFFER_ACCEPTED' },
      );
    });

    it('includes application stats in the result (calls radarRepo.find)', async () => {
      const { tool, radarRepo } = buildTool();
      radarRepo.find.mockResolvedValue([
        makeRadarItem('APPLIED'),
        makeRadarItem('APPLIED'),
        makeRadarItem('INTERVIEWING'),
        makeRadarItem('OFFER_ACCEPTED'),
      ]);

      const result = await tool.execute('tc_01', params, ctx);

      expect(radarRepo.find).toHaveBeenCalledWith({ where: { userId: 'u_01' } });
      expect(result.details).toHaveProperty('stats');
      const stats = result.details['stats'] as any;
      expect(stats.applied).toBe(2);
      expect(stats.interviewed).toBe(1);
      expect(stats.offers).toBe(1);
    });

    it('returns text containing farewellMessage when LLM returns valid JSON', async () => {
      const { tool } = buildTool();

      const result = await tool.execute('tc_01', params, ctx);

      const text = result.content[0].text;
      expect(text).toContain('Congrats');
    });

    it('result.details has farewellMessage and recapMarkdown fields', async () => {
      const { tool } = buildTool();

      const result = await tool.execute('tc_01', params, ctx);

      expect(result.details).toHaveProperty('farewellMessage');
      expect(result.details).toHaveProperty('recapMarkdown');
    });

    it('falls back to hardcoded farewell when LLM throws', async () => {
      const { tool, llm } = buildTool();
      llm.completeContext.mockRejectedValue(new Error('LLM down'));

      const result = await tool.execute('tc_01', params, ctx);

      expect(result.content[0].text).toBeTruthy();
      expect(result.details).toHaveProperty('farewellMessage');
    });

    it('fallback text contains materials count when LLM throws', async () => {
      const { tool, llm, materialRepo } = buildTool();
      llm.completeContext.mockRejectedValue(new Error('LLM down'));
      materialRepo.find.mockResolvedValue([makeMaterial(), makeMaterial(), makeMaterial()]);

      const result = await tool.execute('tc_01', params, ctx);

      // Fallback farewellMessage mentions the count of materials
      const farewell = result.details['farewellMessage'] as string;
      expect(farewell).toContain('3');
    });

    it('result.details.farewellMessage is populated from LLM JSON', async () => {
      const { tool, llm } = buildTool();
      llm.completeContext.mockResolvedValue(
        '{"farewellMessage":"Well done","recapMarkdown":"## Done"}',
      );

      const result = await tool.execute('tc_01', params, ctx);

      expect(result.details['farewellMessage']).toBe('Well done');
      expect(result.details['recapMarkdown']).toBe('## Done');
    });

    it('result.details.recapMarkdown is populated from LLM JSON', async () => {
      const { tool, llm } = buildTool();
      llm.completeContext.mockResolvedValue(
        '{"farewellMessage":"Congrats","recapMarkdown":"# Recap\\n\\nGood work"}',
      );

      const result = await tool.execute('tc_01', params, ctx);

      expect(result.details['recapMarkdown']).toContain('Recap');
    });
  });
});
