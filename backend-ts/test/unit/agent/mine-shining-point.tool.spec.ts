// FILE: test/unit/agent/mine-shining-point.tool.spec.ts
import { vi } from 'vitest';
import { MineShiningPointTool } from '../../../src/agent/tools/mine-shining-point.tool.js';

function buildTool() {
  const repo = {
    create: vi.fn().mockImplementation((data) => ({ ...data })),
    save: vi.fn().mockImplementation(async (entity) => entity),
  };
  const llm = {
    structuredComplete: vi.fn().mockResolvedValue({
      shiningText: 'Redesigned onboarding within 60 days, reducing ramp time by 30%',
      rationale: 'Shows ownership and early impact',
      tags: ['ownership', 'process_improvement'],
    }),
  };
  const crypto = {
    encrypt: vi.fn().mockResolvedValue('encrypted-raw'),
  };
  const memoryQueue = {
    add: vi.fn().mockResolvedValue(undefined),
  };

  const tool = new MineShiningPointTool(
    repo as any,
    llm as any,
    crypto as any,
    memoryQueue as any,
  );
  return { tool, repo, llm, crypto, memoryQueue };
}

const ctx = { userId: 'u_01', conversationId: 'conv_01' };
const params = { raw_text: 'I redesigned our onboarding process in my first two months.' };

describe('MineShiningPointTool', () => {
  describe('execute', () => {
    it('calls crypto.encrypt with raw_text', async () => {
      const { tool, crypto } = buildTool();

      await tool.execute('tc_01', params, ctx);

      expect(crypto.encrypt).toHaveBeenCalledWith(params.raw_text);
    });

    it('creates material with status PROPOSED and calls repo.save', async () => {
      const { tool, repo } = buildTool();

      await tool.execute('tc_01', params, ctx);

      expect(repo.save).toHaveBeenCalled();
      const saved = repo.create.mock.calls[0][0] as any;
      expect(saved.status).toBe('PROPOSED');
    });

    it('enqueues embed-material job in memoryQueue', async () => {
      const { tool, memoryQueue } = buildTool();

      await tool.execute('tc_01', params, ctx);

      expect(memoryQueue.add).toHaveBeenCalledWith(
        'embed-material',
        expect.objectContaining({ type: 'EMBED_MATERIAL' }),
      );
    });

    it('result.details has materialId, shiningText, and tags', async () => {
      const { tool } = buildTool();

      const result = await tool.execute('tc_01', params, ctx);

      expect(result.details).toHaveProperty('materialId');
      expect(result.details).toHaveProperty('shiningText');
      expect(result.details).toHaveProperty('tags');
    });

    it('shiningText in details matches LLM output', async () => {
      const { tool } = buildTool();

      const result = await tool.execute('tc_01', params, ctx);

      expect(result.details['shiningText']).toBe(
        'Redesigned onboarding within 60 days, reducing ramp time by 30%',
      );
    });

    it('falls back to raw_text as shiningText when structuredComplete returns no shiningText', async () => {
      const { tool, llm } = buildTool();
      llm.structuredComplete.mockResolvedValue({});

      const result = await tool.execute('tc_01', params, ctx);

      expect(result.details['shiningText']).toBe(params.raw_text);
    });

    it('repo.save still called when structuredComplete returns no shiningText', async () => {
      const { tool, repo, llm } = buildTool();
      llm.structuredComplete.mockResolvedValue({});

      await tool.execute('tc_01', params, ctx);

      expect(repo.save).toHaveBeenCalled();
    });

    it('material is created with userId from context', async () => {
      const { tool, repo } = buildTool();

      await tool.execute('tc_01', params, { userId: 'u_99', conversationId: 'conv_01' });

      const created = repo.create.mock.calls[0][0] as any;
      expect(created.userId).toBe('u_99');
    });
  });
});
