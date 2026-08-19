// FILE: test/unit/agent/classify-email.tool.spec.ts
import { vi } from 'vitest';
import { ClassifyEmailTool } from '../../../src/agent/tools/classify-email.tool.js';

const makeEmail = (overrides: Record<string, unknown> = {}) =>
  ({
    id: 'email_01',
    subject: 'Interview Invitation',
    fromAddr: 'recruiter@acme.com',
    bodyText: 'encrypted-body',
    kind: null,
    parsed: null,
    ...overrides,
  }) as any;

function buildTool() {
  const repo = {
    findOne: vi.fn().mockResolvedValue(null),
    save: vi.fn().mockResolvedValue(undefined),
  };
  // structuredComplete returns the schema-decoded object directly (the provider's
  // constrained sampling guarantees the shape) — no JSON string, no parse.
  const llm = {
    structuredComplete: vi.fn().mockResolvedValue({
      kind: 'INTERVIEW_INVITE',
      keyInfo: { interviewDate: '2026-06-10' },
      summary: 'You have been invited to interview',
    }),
  };
  const crypto = {
    decrypt: vi.fn().mockResolvedValue('Please join us for an interview on June 10.'),
  };

  const tool = new ClassifyEmailTool(repo as any, llm as any, crypto as any);
  return { tool, repo, llm, crypto };
}

const params = { email_capture_id: 'email_01' };

describe('ClassifyEmailTool', () => {
  describe('execute', () => {
    it('returns not found when repo.findOne returns null', async () => {
      const { tool } = buildTool();

      const result = await tool.execute('tc_01', params);

      expect(result.content[0].text).toContain('not found');
    });

    it('calls crypto.decrypt when email has bodyText', async () => {
      const { tool, repo, crypto } = buildTool();
      repo.findOne.mockResolvedValue(makeEmail());

      await tool.execute('tc_01', params);

      expect(crypto.decrypt).toHaveBeenCalledWith('encrypted-body');
    });

    it('does not call crypto.decrypt when email has no bodyText', async () => {
      const { tool, repo, crypto } = buildTool();
      repo.findOne.mockResolvedValue(makeEmail({ bodyText: null }));

      await tool.execute('tc_01', params);

      expect(crypto.decrypt).not.toHaveBeenCalled();
    });

    it('calls repo.save with kind from structuredComplete result', async () => {
      const { tool, repo } = buildTool();
      const email = makeEmail();
      repo.findOne.mockResolvedValue(email);

      await tool.execute('tc_01', params);

      expect(repo.save).toHaveBeenCalled();
      expect(email.kind).toBe('INTERVIEW_INVITE');
    });

    it('result.details has emailId, kind, and keyInfo on success', async () => {
      const { tool, repo } = buildTool();
      repo.findOne.mockResolvedValue(makeEmail());

      const result = await tool.execute('tc_01', params);

      expect(result.details).toHaveProperty('emailId', 'email_01');
      expect(result.details).toHaveProperty('kind', 'INTERVIEW_INVITE');
      expect(result.details).toHaveProperty('keyInfo');
    });

    it('propagates LLM errors without saving', async () => {
      const { tool, repo, llm } = buildTool();
      repo.findOne.mockResolvedValue(makeEmail());
      llm.structuredComplete.mockRejectedValue(new Error('LLM unavailable'));

      // structuredComplete is not wrapped in try/catch in the source — an LLM
      // failure propagates out of execute (the job/agent boundary handles it),
      // and nothing is persisted.
      await expect(tool.execute('tc_01', params)).rejects.toThrow('LLM unavailable');
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('result.content[0].text contains summary from LLM', async () => {
      const { tool, repo } = buildTool();
      repo.findOne.mockResolvedValue(makeEmail());

      const result = await tool.execute('tc_01', params);

      expect(result.content[0].text).toContain('invited to interview');
    });
  });
});
