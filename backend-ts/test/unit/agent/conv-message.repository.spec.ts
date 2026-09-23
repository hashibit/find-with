/**
 * Unit tests — ConvMessageRepository reassembly.
 *
 * Uses the real EphemeralCryptoService (identity) so encrypted columns hold
 * plaintext bytes — round-trip assertions stay readable. TypeORM repositories
 * are in-memory stand-ins.
 */
import { describe, it, expect, vi } from 'vitest';
import type { AssistantMessage } from '@earendil-works/pi-ai';
import type { Repository } from 'typeorm';
import type { PinoLogger } from 'nestjs-pino';

import { ConvMessageRepository } from '../../../src/agent/conv-message.repository.js';
import { ConvMessage } from '../../../src/database/entities/conversation/message.entity.js';
import { ConvToolCall } from '../../../src/database/entities/conversation/tool-call.entity.js';
import { EphemeralCryptoService } from '../../../src/common/crypto/ephemeral-crypto.service.js';

const CONV = 'conv_01';
const T0 = 1_700_000_000_000;

function makeRepo() {
  const messages: ConvMessage[] = [];
  const toolCalls: ConvToolCall[] = [];
  let clock = 0;

  const messageRepo = {
    create: vi.fn().mockImplementation((data: ConvMessage) => data),
    createQueryBuilder: vi.fn().mockImplementation(() => {
      let values: ConvMessage;
      return {
        insert: () => ({
          into: () => ({
            values: (data: ConvMessage) => {
              values = data;
              return {
                orIgnore: () => ({
                  returning: () => ({
                    execute: async () => {
                      const duplicate = messages.some(
                        (m) =>
                          m.conversationId === values.conversationId &&
                          values.clientMessageId !== null &&
                          m.clientMessageId === values.clientMessageId,
                      );
                      if (duplicate) return { raw: [] };
                      values.createdAt = new Date(T0 + clock++);
                      messages.push(values);
                      return { raw: [{ id: values.id }] };
                    },
                  }),
                }),
              };
            },
          }),
        }),
      };
    }),
    save: vi.fn().mockImplementation(async (data: ConvMessage) => {
      // Backfill what the DB would (createdAt + id ordering).
      data.createdAt = new Date(T0 + clock++);
      messages.push(data);
      return data;
    }),
    find: vi.fn().mockImplementation(async () => [...messages]),
  };

  const toolCallRepo = {
    create: vi.fn().mockImplementation((data: ConvToolCall) => data),
    save: vi.fn().mockImplementation(async (data: ConvToolCall) => {
      data.createdAt = new Date(T0 + clock++);
      toolCalls.push(data);
      return data;
    }),
    find: vi.fn().mockImplementation(async () => [...toolCalls]),
  };

  const logger = { warn: vi.fn() };
  const repo = new ConvMessageRepository(
    messageRepo as unknown as Repository<ConvMessage>,
    toolCallRepo as unknown as Repository<ConvToolCall>,
    new EphemeralCryptoService(),
    logger as unknown as PinoLogger,
  );

  return { repo, messages, toolCalls, logger };
}

function assistantMessage(content: AssistantMessage['content']): AssistantMessage {
  return {
    role: 'assistant',
    content,
    api: 'anthropic-messages',
    provider: 'anthropic',
    model: 'claude-test',
    usage: {
      input: 10,
      output: 5,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 15,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason: 'toolUse',
    timestamp: Date.now(),
  };
}

describe('ConvMessageRepository', () => {
  it('round-trips user → assistant(thinking+text+toolCall) → toolResult', async () => {
    const { repo } = makeRepo();

    await repo.saveUser(CONV, 'hello there');
    const assistantId = await repo.saveAssistant(
      CONV,
      assistantMessage([
        { type: 'thinking', thinking: 'let me look that up', thinkingSignature: 'sig123' },
        { type: 'text', text: 'Checking the company now.' },
        {
          type: 'toolCall',
          id: 'call_1',
          name: 'search_company_info',
          arguments: { company: 'Stripe' },
        },
      ]),
    );
    await repo.saveToolCall(CONV, assistantId, {
      toolCallId: 'call_1',
      toolName: 'search_company_info',
      seq: 0,
      arguments: { company: 'Stripe' },
      result: '{"ok":true}',
      isError: false,
    });

    const msgs = await repo.findRecentForContext(CONV, 30);

    expect(msgs.map((m) => m.role)).toEqual(['user', 'assistant', 'toolResult']);

    const assistant = msgs[1] as AssistantMessage;
    expect(assistant.content).toHaveLength(3);
    expect(assistant.content[0]).toEqual({
      type: 'thinking',
      thinking: 'let me look that up',
      thinkingSignature: 'sig123',
    });
    expect(assistant.content[1]).toEqual({ type: 'text', text: 'Checking the company now.' });
    expect(assistant.content[2]).toEqual({
      type: 'toolCall',
      id: 'call_1',
      name: 'search_company_info',
      arguments: { company: 'Stripe' },
    });
    // Stub fields, not the live message's usage.
    expect(assistant.usage.totalTokens).toBe(0);
    expect(assistant.model).toBe('claude-test');
    expect(assistant.stopReason).toBe('toolUse');

    const toolResult = msgs[2];
    expect(toolResult).toMatchObject({
      role: 'toolResult',
      toolCallId: 'call_1',
      toolName: 'search_company_info',
      isError: false,
    });
  });

  it('trims history to the last `limit` messages aligned at a USER boundary', async () => {
    const { repo } = makeRepo();

    await repo.saveUser(CONV, 'first question');
    await repo.saveAssistant(CONV, assistantMessage([{ type: 'text', text: 'first answer' }]));
    await repo.saveUser(CONV, 'second question');
    await repo.saveAssistant(CONV, assistantMessage([{ type: 'text', text: 'second answer' }]));

    const msgs = await repo.findRecentForContext(CONV, 3);

    // Window of 3 starting at a hard cut (index 1) realigns to the USER turn.
    expect(msgs.map((m) => m.role)).toEqual(['user', 'assistant']);
    expect((msgs[0] as { content: string }).content).toBe('second question');
  });

  it('drops tool calls with corrupt arguments but keeps the assistant text', async () => {
    const { repo, toolCalls, logger } = makeRepo();

    const assistantId = await repo.saveAssistant(
      CONV,
      assistantMessage([
        { type: 'text', text: 'turn text' },
        {
          type: 'toolCall',
          id: 'call_1',
          name: 'search_company_info',
          arguments: { company: 'Stripe' },
        },
      ]),
    );
    await repo.saveToolCall(CONV, assistantId, {
      toolCallId: 'call_1',
      toolName: 'search_company_info',
      seq: 0,
      arguments: { company: 'Stripe' },
      result: 'ok',
      isError: false,
    });
    // Simulate a corrupt stored blob.
    toolCalls[0]!.encryptedArguments = Buffer.from('not-json');

    const msgs = await repo.findRecentForContext(CONV, 30);

    expect(msgs.map((m) => m.role)).toEqual(['assistant']);
    const assistant = msgs[0] as AssistantMessage;
    expect(assistant.content).toEqual([{ type: 'text', text: 'turn text' }]);
    expect(logger.warn).toHaveBeenCalled();
  });

  it('drops assistant turns that decrypt to empty content', async () => {
    const { repo } = makeRepo();

    await repo.saveUser(CONV, 'real user turn');
    await repo.saveAssistant(CONV, assistantMessage([]));

    const msgs = await repo.findRecentForContext(CONV, 30);

    expect(msgs.map((m) => m.role)).toEqual(['user']);
  });

  it('stores non-sensitive metadata and omits absent optional fields', async () => {
    const { repo, messages } = makeRepo();

    await repo.saveAssistant(CONV, assistantMessage([{ type: 'text', text: 'plain answer' }]));

    expect(messages[0]!.metadata).toEqual({
      provider: 'anthropic',
      model: 'claude-test',
      stopReason: 'toolUse',
    });
    expect(messages[0]!.metadata).not.toHaveProperty('responseId');
    expect(messages[0]!.metadata).not.toHaveProperty('errorMessage');
  });

  it('findDecryptedTurns exposes text, thinking and tool results for briefs', async () => {
    const { repo } = makeRepo();

    const assistantId = await repo.saveAssistant(
      CONV,
      assistantMessage([
        { type: 'thinking', thinking: 'hmm', thinkingSignature: 's' },
        { type: 'text', text: 'the answer' },
      ]),
    );
    await repo.saveToolCall(CONV, assistantId, {
      toolCallId: 'call_9',
      toolName: 'draft_reply',
      seq: 0,
      arguments: { intent: 'follow-up' },
      result: 'draft text',
      isError: true,
    });

    const turns = await repo.findDecryptedTurns(CONV);

    expect(turns).toEqual([
      {
        id: assistantId,
        role: 'ASSISTANT',
        text: 'the answer',
        thinkingText: expect.stringContaining('hmm'),
        calls: [
          {
            toolCallId: 'call_9',
            toolName: 'draft_reply',
            resultText: 'draft text',
            isError: true,
          },
        ],
      },
    ]);
  });
});
