import { Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, MoreThan, Repository } from 'typeorm';
import { ulid } from 'ulid';
import { PinoLogger, InjectPinoLogger } from 'nestjs-pino';
import type {
  AssistantMessage,
  Message,
  ThinkingContent,
  ToolResultMessage,
} from '@earendil-works/pi-ai';
import {
  ConvMessage,
  type ConvMessageRole,
} from '../database/entities/conversation/message.entity.js';
import { ConvToolCall } from '../database/entities/conversation/tool-call.entity.js';
import { FIELD_CRYPTO, type FieldCrypto } from '../common/crypto/crypto.interface.js';

/** One persisted invocation: arguments + result, atomic per row. */
export interface ToolExecutionRecord {
  toolCallId: string;
  toolName: string;
  seq: number;
  arguments: Record<string, unknown>;
  result: string;
  isError: boolean;
}

export interface PersistedToolResult {
  result: string;
  isError: boolean;
}

export type ToolExecutionClaim =
  | { state: 'NEW' }
  | { state: 'IN_PROGRESS' }
  | ({ state: 'DONE' } & PersistedToolResult);

/** Decrypted turn for compression/brief consumers (context-builder). */
export interface DecryptedTurn {
  id: string;
  role: ConvMessageRole;
  text: string;
  /** Excluded from briefs but counted for the compress threshold — thinking
   * occupies the context window on the Anthropic replay path. */
  thinkingText: string;
  calls: Array<{
    toolCallId: string;
    toolName: string;
    resultText: string;
    isError: boolean;
  }>;
}

const ZERO_USAGE: AssistantMessage['usage'] = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};

interface PersistedCall {
  row: ConvToolCall;
  arguments: Record<string, unknown>;
  resultText: string;
}

@Injectable()
export class ConvMessageRepository {
  constructor(
    @InjectRepository(ConvMessage) private readonly repo: Repository<ConvMessage>,
    @InjectRepository(ConvToolCall) private readonly toolCallRepo: Repository<ConvToolCall>,
    @Inject(FIELD_CRYPTO) private readonly crypto: FieldCrypto,
    @InjectPinoLogger(ConvMessageRepository.name) private readonly logger: PinoLogger,
  ) {}

  /**
   * Persist a user message. With clientMessageId the insert is idempotent per
   * (conversationId, clientMessageId): SSE re-sends of the same prompt
   * collapse to the original row. Returns true when a new row was inserted.
   */
  async saveUser(
    conversationId: string,
    plainText: string,
    clientMessageId?: string,
  ): Promise<boolean> {
    const encryptedText = await this.crypto.encrypt(plainText);
    // orIgnore → ON CONFLICT DO NOTHING; RETURNING id makes the duplicate case
    // distinguishable (conflict yields no returned row).
    const result = await this.repo
      .createQueryBuilder()
      .insert()
      .into(ConvMessage)
      .values({
        id: ulid(),
        conversationId,
        role: 'USER',
        encryptedText,
        clientMessageId: clientMessageId ?? null,
      })
      .orIgnore(true)
      .returning('id')
      .execute();
    return (result.raw as Array<{ id: string }>).length > 0;
  }

  /** A send-side idempotency key is complete only after an assistant response exists. */
  async isTurnCompleted(conversationId: string, clientMessageId: string): Promise<boolean> {
    const user = await this.repo.findOne({
      where: { conversationId, clientMessageId, role: 'USER' },
      select: ['id', 'createdAt'],
    });
    if (!user) return false;

    const assistant = await this.repo.findOne({
      where: { conversationId, role: 'ASSISTANT', createdAt: MoreThan(user.createdAt) },
      order: { createdAt: 'ASC' },
      select: ['id', 'createdAt'],
    });
    return Boolean(assistant && assistant.createdAt > user.createdAt);
  }

  /**
   * Persist one assistant turn: text + thinking encrypted on the row,
   * non-sensitive metadata extracted for debugging. Tool calls are persisted
   * separately via saveToolCall once executed. Returns the row id —
   * saveToolCall needs it for pairing.
   */
  async saveAssistant(conversationId: string, finalMessage: AssistantMessage): Promise<string> {
    const id = ulid();
    const text = finalMessage.content
      .filter((b) => b.type == 'text')
      .map((b) => b.text)
      .join('');

    const thinkingBlocks = finalMessage.content
      .filter((b) => b.type == 'thinking')
      .map((b) => ({
        thinking: b.thinking,
        thinkingSignature: b.thinkingSignature,
        redacted: b.redacted,
      }));

    const metadata: Record<string, unknown> = {
      provider: finalMessage.provider,
      model: finalMessage.model,
      stopReason: finalMessage.stopReason,
    };
    if (finalMessage.responseId) metadata.responseId = finalMessage.responseId;
    if (finalMessage.errorMessage) metadata.errorMessage = finalMessage.errorMessage;

    const encryptedText = text ? await this.crypto.encrypt(text) : null;
    const encryptedThinking = thinkingBlocks.length
      ? await this.crypto.encrypt(JSON.stringify(thinkingBlocks))
      : null;

    await this.repo.save(
      this.repo.create({
        id,
        conversationId,
        role: 'ASSISTANT',
        encryptedText,
        encryptedThinking,
        metadata,
      }),
    );
    return id;
  }

  /** Claim a tool call before its side effect starts. The unique DB key closes races across workers. */
  async claimToolCall(
    conversationId: string,
    assistantId: string,
    rec: Omit<ToolExecutionRecord, 'result' | 'isError'>,
  ): Promise<ToolExecutionClaim> {
    const existing = await this.toolCallRepo.findOne({
      where: { conversationId, toolCallId: rec.toolCallId },
    });
    if (existing) {
      if (existing.status === 'PROCESSING') return { state: 'IN_PROGRESS' };
      const result = await this.decryptText(existing.encryptedResult);
      return result === null
        ? { state: 'IN_PROGRESS' }
        : { state: 'DONE', result, isError: existing.isError };
    }

    try {
      await this.toolCallRepo.save(
        this.toolCallRepo.create({
          id: ulid(),
          conversationId,
          assistantId,
          toolCallId: rec.toolCallId,
          toolName: rec.toolName,
          seq: rec.seq,
          encryptedArguments: await this.crypto.encrypt(JSON.stringify(rec.arguments)),
          encryptedResult: null,
          isError: false,
          status: 'PROCESSING',
        }),
      );
      return { state: 'NEW' };
    } catch {
      // Another worker may have won the unique claim between findOne and save.
      return { state: 'IN_PROGRESS' };
    }
  }

  async completeToolCall(
    conversationId: string,
    toolCallId: string,
    result: string,
    isError: boolean,
  ): Promise<void> {
    await this.toolCallRepo.update(
      { conversationId, toolCallId },
      {
        encryptedResult: await this.crypto.encrypt(result),
        isError,
        status: isError ? 'FAILED' : 'SUCCEEDED',
      },
    );
  }

  /** Backward-compatible helper for callers that already have the result. */
  async saveToolCall(
    conversationId: string,
    assistantId: string,
    rec: ToolExecutionRecord,
  ): Promise<void> {
    const claim = await this.claimToolCall(conversationId, assistantId, rec);
    if (claim.state === 'NEW') {
      await this.completeToolCall(conversationId, rec.toolCallId, rec.result, rec.isError);
    }
  }

  /** Return a previously persisted result so a retried model turn is side-effect free. */
  async findToolResult(
    conversationId: string,
    toolCallId: string,
  ): Promise<PersistedToolResult | null> {
    const row = await this.toolCallRepo.findOne({ where: { conversationId, toolCallId } });
    if (!row || row.status === 'PROCESSING' || !row.encryptedResult) return null;
    const result = await this.decryptText(row.encryptedResult);
    return result === null ? null : { result, isError: row.isError };
  }

  /**
   * Load and decrypt recent messages for LLM context building. This
   * repository is the only plaintext outlet for conv_messages/conv_tool_calls.
   * Reassembly pairs tool calls to their assistant row via assistantId —
   * never row order. Rows/segments that fail to decrypt are warn-logged and
   * dropped.
   */
  async findRecentForContext(conversationId: string, limit: number): Promise<Message[]> {
    const { messages } = await this.loadTurns(conversationId, limit);
    if (messages.length <= limit) return messages;

    // Keep the most recent `limit` messages, aligned to a USER boundary so
    // the window never leads with a toolResult. Falls back to a hard cut if
    // no user turn exists inside the window.
    let start = messages.length - limit;
    const userStart = messages.findIndex((m, i) => i >= start && m.role === 'user');
    if (userStart !== -1) start = userStart;
    return messages.slice(start);
  }

  /** Decrypted turns for the compression/brief path (context-builder). */
  async findDecryptedTurns(conversationId: string): Promise<DecryptedTurn[]> {
    const { turns } = await this.loadTurns(conversationId);
    return turns;
  }

  private async loadTurns(
    conversationId: string,
    speakerLimit?: number,
  ): Promise<{
    turns: DecryptedTurn[];
    messages: Message[];
  }> {
    const rows = await this.repo.find({
      where: { conversationId, archived: false },
      order: { createdAt: speakerLimit ? 'DESC' : 'ASC', id: speakerLimit ? 'DESC' : 'ASC' },
      ...(speakerLimit ? { take: speakerLimit } : {}),
    });
    const chronologicalRows = [...rows].sort((a, b) => {
      const byCreatedAt = a.createdAt.getTime() - b.createdAt.getTime();
      return byCreatedAt || a.id.localeCompare(b.id);
    });
    const selectedRows = speakerLimit
      ? chronologicalRows.slice(Math.max(0, chronologicalRows.length - speakerLimit))
      : chronologicalRows;
    const firstUserIndex = selectedRows.findIndex((row) => row.role === 'USER');
    const alignedRows = speakerLimit
      ? selectedRows[0]?.role === 'ASSISTANT' && firstUserIndex >= 0
        ? selectedRows.slice(firstUserIndex)
        : selectedRows
      : selectedRows;
    const assistantIds = alignedRows.filter((row) => row.role === 'ASSISTANT').map((row) => row.id);
    const callRows = assistantIds.length
      ? await this.toolCallRepo.find({
          where: { conversationId, assistantId: In(assistantIds) },
          order: { seq: 'ASC', id: 'ASC' },
        })
      : [];

    const callsByAssistant = new Map<string, PersistedCall[]>();
    for (const row of callRows) {
      const call = await this.decryptCall(row);
      if (!call) continue;
      const list = callsByAssistant.get(row.assistantId) ?? [];
      list.push(call);
      callsByAssistant.set(row.assistantId, list);
    }

    const turns: DecryptedTurn[] = [];
    const messages: Message[] = [];

    for (const row of alignedRows) {
      if (row.role === 'USER') {
        const text = await this.decryptText(row.encryptedText);
        if (text === null) continue;
        turns.push({ id: row.id, role: 'USER', text, thinkingText: '', calls: [] });
        messages.push({ role: 'user', content: text, timestamp: row.createdAt.getTime() });
        continue;
      }

      if (row.role === 'ASSISTANT') {
        const text = (await this.decryptText(row.encryptedText)) ?? '';
        const thinking = await this.decryptThinking(row.encryptedThinking);
        const calls = callsByAssistant.get(row.id) ?? [];

        // Canonical block order = the order models emit: thinking → text →
        // toolCalls.
        const content: AssistantMessage['content'] = [
          ...thinking.blocks,
          ...(text ? [{ type: 'text' as const, text }] : []),
          ...calls.map(({ row: callRow, arguments: callArgs }) => ({
            type: 'toolCall' as const,
            id: callRow.toolCallId,
            name: callRow.toolName,
            arguments: callArgs,
          })),
        ];
        // Nothing survived decryption (or the turn was empty) — an assistant
        // message with empty content is an invalid provider request; drop it.
        if (!content.length) continue;

        const meta = (row.metadata ?? {}) as Record<string, unknown>;
        const assistantMessage: AssistantMessage = {
          role: 'assistant',
          content,
          api: '',
          provider: typeof meta.provider === 'string' ? meta.provider : '',
          model: typeof meta.model === 'string' ? meta.model : '',
          usage: ZERO_USAGE,
          stopReason:
            typeof meta.stopReason === 'string'
              ? (meta.stopReason as AssistantMessage['stopReason'])
              : 'stop',
          timestamp: row.createdAt.getTime(),
        };
        messages.push(assistantMessage);

        turns.push({
          id: row.id,
          role: 'ASSISTANT',
          text,
          thinkingText: thinking.raw,
          calls: calls.map(({ row: callRow, resultText }) => ({
            toolCallId: callRow.toolCallId,
            toolName: callRow.toolName,
            resultText,
            isError: callRow.isError,
          })),
        });

        for (const { row: callRow, resultText } of calls) {
          const toolResult: ToolResultMessage = {
            role: 'toolResult',
            toolCallId: callRow.toolCallId,
            toolName: callRow.toolName,
            content: [{ type: 'text', text: resultText }],
            isError: callRow.isError,
            timestamp: callRow.createdAt.getTime(),
          };
          messages.push(toolResult);
        }
      }
    }

    return { turns, messages };
  }

  private async decryptText(blob: Buffer | null | undefined): Promise<string | null> {
    if (!blob) return null;
    try {
      return await this.crypto.decrypt(blob);
    } catch (err) {
      this.logger.warn(`conv_messages: dropping undecryptable content — ${(err as Error).message}`);
      return null;
    }
  }

  private async decryptThinking(
    blob: Buffer | null | undefined,
  ): Promise<{ raw: string; blocks: ThinkingContent[] }> {
    if (!blob) return { raw: '', blocks: [] };
    const raw = await this.decryptText(blob);
    if (!raw) return { raw: '', blocks: [] };
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) return { raw: '', blocks: [] };
      const blocks: ThinkingContent[] = [];
      for (const b of parsed) {
        if (typeof b !== 'object' || b === null || !('thinking' in b)) continue;
        const t = b as { thinking: unknown; thinkingSignature?: unknown; redacted?: unknown };
        blocks.push({
          type: 'thinking',
          thinking: String(t.thinking),
          ...(typeof t.thinkingSignature === 'string'
            ? { thinkingSignature: t.thinkingSignature }
            : {}),
          ...(t.redacted === true ? { redacted: true } : {}),
        });
      }
      return { raw, blocks };
    } catch {
      // Corrupt thinking JSON — drop it; replay degrades to text/toolCalls.
      this.logger.warn('conv_messages: dropping corrupt thinking blob');
      return { raw: '', blocks: [] };
    }
  }

  private async decryptCall(row: ConvToolCall): Promise<PersistedCall | null> {
    if (row.status === 'PROCESSING' || !row.encryptedResult) return null;
    const argsRaw = await this.decryptText(row.encryptedArguments);
    const resultText = await this.decryptText(row.encryptedResult);
    if (argsRaw === null || resultText === null) return null;
    try {
      const args: unknown = JSON.parse(argsRaw);
      if (typeof args !== 'object' || args === null) return null;
      return { row, arguments: args as Record<string, unknown>, resultText };
    } catch {
      this.logger.warn(
        `conv_tool_calls: dropping call with corrupt arguments json (toolCallId=${row.toolCallId})`,
      );
      return null;
    }
  }
}
