// FILE: test/unit/agent/set-conversation-density.tool.spec.ts
import { vi } from 'vitest';
import { SetConversationDensityTool } from '../../../src/agent/tools/set-conversation-density.tool.js';

function buildTool() {
  const repo = {
    update: vi.fn().mockResolvedValue(undefined),
  };

  const tool = new SetConversationDensityTool(repo as any);
  return { tool, repo };
}

const ctx = { conversationId: 'conv_01' };

describe('SetConversationDensityTool', () => {
  describe('execute', () => {
    it('calls repo.update with effectiveDensity ENGAGED', async () => {
      const { tool, repo } = buildTool();

      await tool.execute('tc_01', { density: 'ENGAGED', reason: 'user asked' }, ctx);

      expect(repo.update).toHaveBeenCalledWith(
        { id: 'conv_01' },
        { effectiveDensity: 'ENGAGED' },
      );
    });

    it('result.content[0].text contains "proactive" for ENGAGED', async () => {
      const { tool } = buildTool();

      const result = await tool.execute('tc_01', { density: 'ENGAGED', reason: 'user asked' }, ctx);

      expect(result.content[0].text.toLowerCase()).toContain('proactive');
    });

    it('calls repo.update with effectiveDensity BALANCED', async () => {
      const { tool, repo } = buildTool();

      await tool.execute('tc_01', { density: 'BALANCED', reason: 'default' }, ctx);

      expect(repo.update).toHaveBeenCalledWith(
        { id: 'conv_01' },
        { effectiveDensity: 'BALANCED' },
      );
    });

    it('calls repo.update with effectiveDensity QUIET', async () => {
      const { tool, repo } = buildTool();

      await tool.execute('tc_01', { density: 'QUIET', reason: 'do not disturb' }, ctx);

      expect(repo.update).toHaveBeenCalledWith(
        { id: 'conv_01' },
        { effectiveDensity: 'QUIET' },
      );
    });

    it('result.content[0].text contains "minimal" for QUIET', async () => {
      const { tool } = buildTool();

      const result = await tool.execute('tc_01', { density: 'QUIET', reason: 'do not disturb' }, ctx);

      expect(result.content[0].text.toLowerCase()).toContain('minimal');
    });

    it('result.details has density and conversationId', async () => {
      const { tool } = buildTool();

      const result = await tool.execute('tc_01', { density: 'BALANCED', reason: 'reset' }, ctx);

      expect(result.details).toHaveProperty('density', 'BALANCED');
      expect(result.details).toHaveProperty('conversationId', 'conv_01');
    });

    it('repo.update uses conversationId from context', async () => {
      const { tool, repo } = buildTool();

      await tool.execute('tc_01', { density: 'QUIET', reason: 'test' }, { conversationId: 'conv_99' });

      expect(repo.update).toHaveBeenCalledWith(
        { id: 'conv_99' },
        expect.any(Object),
      );
    });
  });
});
