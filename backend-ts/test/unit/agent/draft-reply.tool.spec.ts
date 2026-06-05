// FILE: test/unit/agent/draft-reply.tool.spec.ts
import { vi } from 'vitest';
import { DraftReplyTool } from '../../../src/agent/tools/draft-reply.tool.js';

const makeEmail = (overrides: Record<string, unknown> = {}) =>
  ({
    id: 'email_01',
    subject: 'Interview on June 12',
    fromAddr: 'recruiter@acme.com',
    bodyText: 'encrypted-body',
    ...overrides,
  }) as any;

const makeDraft = (overrides: Record<string, unknown> = {}) =>
  ({ id: 'draft_01', emailId: 'email_01', userId: 'u_01', text: 'Thank you.', intent: 'accept_interview', ...overrides }) as any;

function buildTool() {
  const emailRepo = {
    findOne: vi.fn().mockResolvedValue(null),
  };
  const draftRepo = {
    create: vi.fn().mockImplementation((data) => ({ ...data })),
    save: vi.fn().mockImplementation(async (entity) => entity),
  };
  const llm = {
    completeContext: vi.fn().mockResolvedValue('Thank you for the invitation. I confirm my attendance.'),
  };
  const crypto = {
    decrypt: vi.fn().mockResolvedValue('Please join us for an interview on June 12.'),
  };

  const tool = new DraftReplyTool(emailRepo as any, draftRepo as any, llm as any, crypto as any);
  return { tool, emailRepo, draftRepo, llm, crypto };
}

const ctx = { userId: 'u_01' };
const params = { email_capture_id: 'email_01', intent: 'accept_interview' as const };

describe('DraftReplyTool', () => {
  describe('execute', () => {
    it('returns not found when emailRepo.findOne returns null', async () => {
      const { tool } = buildTool();

      const result = await tool.execute('tc_01', params, ctx);

      expect(result.content[0].text).toContain('not found');
    });

    it('calls crypto.decrypt when email has bodyText', async () => {
      const { tool, emailRepo, crypto } = buildTool();
      emailRepo.findOne.mockResolvedValue(makeEmail());

      await tool.execute('tc_01', params, ctx);

      expect(crypto.decrypt).toHaveBeenCalledWith('encrypted-body');
    });

    it('does not call crypto.decrypt when email has no bodyText', async () => {
      const { tool, emailRepo, crypto } = buildTool();
      emailRepo.findOne.mockResolvedValue(makeEmail({ bodyText: null }));

      await tool.execute('tc_01', params, ctx);

      expect(crypto.decrypt).not.toHaveBeenCalled();
    });

    it('calls llm.completeContext and draftRepo.save on valid email', async () => {
      const { tool, emailRepo, draftRepo, llm } = buildTool();
      emailRepo.findOne.mockResolvedValue(makeEmail());

      await tool.execute('tc_01', params, ctx);

      expect(llm.completeContext).toHaveBeenCalled();
      expect(draftRepo.save).toHaveBeenCalled();
    });

    it('result.details has draftId and intent', async () => {
      const { tool, emailRepo } = buildTool();
      emailRepo.findOne.mockResolvedValue(makeEmail());

      const result = await tool.execute('tc_01', params, ctx);

      expect(result.details).toHaveProperty('draftId');
      expect(result.details).toHaveProperty('intent', 'accept_interview');
    });

    it('result.content[0].text contains draft reply text from LLM', async () => {
      const { tool, emailRepo } = buildTool();
      emailRepo.findOne.mockResolvedValue(makeEmail());

      const result = await tool.execute('tc_01', params, ctx);

      expect(result.content[0].text).toContain('Thank you for the invitation');
    });

    it('draftRepo.create is called with userId from context', async () => {
      const { tool, emailRepo, draftRepo } = buildTool();
      emailRepo.findOne.mockResolvedValue(makeEmail());

      await tool.execute('tc_01', params, { userId: 'u_99' });

      const createArg = draftRepo.create.mock.calls[0][0] as any;
      expect(createArg.userId).toBe('u_99');
    });
  });
});
