import { Injectable, Logger, Inject, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Observable, Subject } from 'rxjs';
import {
  type AssistantMessage,
  type Context,
  type Message,
  type ToolResultMessage,
  type Model,
  type Api,
} from '@earendil-works/pi-ai';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import { ConvConversation } from '../database/entities/conversation/conversation.entity.js';
import { LLM_PROVIDER, type LlmProvider } from '../llm/llm-provider.interface.js';
import { ContextBuilderService } from './context-builder.service.js';
import { ConvMessageRepository, type ToolExecutionRecord } from './conv-message.repository.js';
import { ToolRegistry, resolveScene, type ToolContext } from './tool-registry.js';
import { ulid } from 'ulid';
import { MEMORY_QUEUE, type MemoryJobData } from '../contexts/memory/memory.constants.js';
import { PendingToolResult } from '../database/entities/agent/pending-tool-result.entity.js';
import { TelemetryEvent } from '../database/entities/telemetry/telemetry-event.entity.js';
import { type AppConfig } from '../config/configuration.js';

import { doWithTimeout } from '../common/timeout.js';

export interface AgentSseEvent {
  data: string;
  type?: string;
}

const MAX_ITERATION = 10;
const TOOL_TIMEOUT_MS = 90_000; // 90 seconds

// Default models for each provider
const DEFAULT_MODELS = {
  openai: { write: 'gpt-4.1', parse: 'gpt-4.1-mini' },
  anthropic: { write: 'claude-sonnet-4-6', parse: 'claude-3-5-haiku-latest' },
  openrouter: { write: 'anthropic/claude-sonnet-4', parse: 'openai/gpt-4.1-mini' },
};

// Base URLs for each provider
const DEFAULT_BASE_URLS = {
  openai: 'https://api.openai.com/v1',
  anthropic: 'https://api.anthropic.com',
  openrouter: 'https://openrouter.ai/api/v1',
};

@Injectable()
export class AgentService {
  private readonly logger = new Logger(AgentService.name);
  private readonly writeModel: Model<Api>;
  private readonly parseModel: Model<Api>;
  private readonly fallbackModel?: Model<Api>;
  private errorCount = 0;
  private errorLastAt = 0;
  private readonly embeddingModel: string;

  constructor(
    @InjectRepository(ConvConversation) private readonly convRepo: Repository<ConvConversation>,
    @InjectRepository(PendingToolResult)
    private readonly pendingToolRepo: Repository<PendingToolResult>,
    @InjectRepository(TelemetryEvent) private readonly telemetryRepo: Repository<TelemetryEvent>,
    @Inject(LLM_PROVIDER) private readonly llm: LlmProvider,
    @InjectQueue(MEMORY_QUEUE) private readonly memoryQueue: Queue<MemoryJobData>,
    private readonly convMessages: ConvMessageRepository,
    private readonly contextBuilder: ContextBuilderService,
    private readonly toolRegistry: ToolRegistry,
    private readonly configService: ConfigService<AppConfig>,
  ) {
    // Build models from configuration
    const llmConfig = this.configService.get('llm', { infer: true });
    this.writeModel = this.buildModel(llmConfig, 'write');
    this.parseModel = this.buildModel(llmConfig, 'parse');
    this.fallbackModel =
      llmConfig.fallbackProvider !== 'none' ? this.buildFallbackModel(llmConfig) : undefined;
    this.embeddingModel = llmConfig.embeddingModel;

    this.logger.log(
      `LLM configured: provider=${llmConfig.provider}, model=${this.writeModel.id}, baseUrl=${this.writeModel.baseUrl}`,
    );
    if (this.fallbackModel) {
      this.logger.log(
        `Fallback: provider=${llmConfig.fallbackProvider}, model=${this.fallbackModel.id}`,
      );
    }
  }

  private buildModel(llmConfig: AppConfig['llm'], usage: 'write' | 'parse'): Model<Api> {
    const provider = llmConfig.provider;
    const providerConfig = llmConfig[provider];
    const defaultModel = DEFAULT_MODELS[provider][usage];
    const defaultBaseUrl = DEFAULT_BASE_URLS[provider];

    const modelId = providerConfig.model || defaultModel;
    const baseUrl = providerConfig.baseUrl || defaultBaseUrl;

    // Determine API type based on provider
    const api: Api = provider === 'anthropic' ? 'anthropic-messages' : 'openai-completions';

    return {
      id: modelId,
      name: modelId,
      api,
      provider,
      baseUrl,
      reasoning: provider === 'anthropic' || modelId.includes('o1') || modelId.includes('o3'),
      input: ['text', 'image'],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, // pi-ai handles pricing internally
      contextWindow: 128000,
      maxTokens: 16384,
    };
  }

  private buildFallbackModel(llmConfig: AppConfig['llm']): Model<Api> {
    const provider = llmConfig.fallbackProvider as 'openai' | 'anthropic' | 'openrouter';
    const providerConfig = llmConfig[provider];
    const defaultModel = DEFAULT_MODELS[provider].write;
    const defaultBaseUrl = DEFAULT_BASE_URLS[provider];

    const modelId = providerConfig.model || defaultModel;
    const baseUrl = providerConfig.baseUrl || defaultBaseUrl;
    const api: Api = provider === 'anthropic' ? 'anthropic-messages' : 'openai-completions';

    return {
      id: modelId,
      name: modelId,
      api,
      provider,
      baseUrl,
      reasoning: provider === 'anthropic',
      input: ['text', 'image'],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 128000,
      maxTokens: 16384,
    };
  }

  private static readonly MAX_USER_MESSAGE = 8_000;

  respond(
    conversationId: string,
    userId: string,
    userMessage: string,
    conversationKind?: string | null,
    anchorId?: string | null,
    clientMessageId?: string | null,
  ): Observable<AgentSseEvent> {
    if (userMessage.length > AgentService.MAX_USER_MESSAGE) {
      throw new BadRequestException(`Message exceeds ${AgentService.MAX_USER_MESSAGE} characters`);
    }
    const subject = new Subject<AgentSseEvent>();
    void this.runAgentLoop(subject, {
      conversationId,
      userId,
      userMessage,
      conversationKind: conversationKind ?? null,
      anchorId,
      clientMessageId: clientMessageId ?? null,
    });
    return subject.asObservable();
  }

  private async runAgentLoop(
    subject: Subject<AgentSseEvent>,
    opts: {
      conversationId: string;
      userId: string;
      userMessage: string;
      conversationKind: string | null;
      anchorId?: string | null;
      clientMessageId?: string | null;
    },
  ): Promise<void> {
    const { conversationId, userId, userMessage } = opts;
    // Look up conversation kind from DB if not provided — keeps controller synchronous
    const conversationKind =
      opts.conversationKind ??
      (await this.convRepo.findOne({ where: { id: conversationId }, select: ['kind'] }))?.kind ??
      'FREE_CHAT';
    const toolCtx: ToolContext = { userId, conversationId };

    try {
      // 1. Persist user message — a duplicate clientMessageId (SSE re-send of
      // the same prompt) means this turn already ran and its response is in
      // conv_messages. Skip the loop; the stream just ends.
      const inserted = await this.saveUserMessage(
        conversationId,
        userMessage,
        opts.clientMessageId ?? undefined,
      );
      if (!inserted) {
        // A client retry is only a completed turn when an assistant row exists.
        // The user row is intentionally written before the provider call, so a
        // provider failure must remain retryable.
        const completed = opts.clientMessageId
          ? await this.convMessages.isTurnCompleted(conversationId, opts.clientMessageId)
          : true;
        if (completed) {
          this.logger.warn(
            `Duplicate completed prompt (clientMessageId already processed) in conversation ${conversationId} — skipping loop`,
          );
          subject.next({
            data: JSON.stringify({ kind: 'done', promptTokens: 0, completionTokens: 0 }),
          });
          subject.complete();
          return;
        }
      }

      // 2. Build pi-ai Context (system prompt + history)
      const context: Context = await this.contextBuilder.build(
        conversationId,
        userId,
        conversationKind,
        opts.anchorId,
      );

      // Attach scene-filtered tools for the LLM to see
      context.tools = this.toolRegistry.getToolsForScene(resolveScene(conversationKind));

      // Add the current user turn
      // If the user row was already persisted by a failed attempt, it is
      // already present in the replay context. Do not append it twice.
      if (inserted) {
        context.messages.push({ role: 'user', content: userMessage, timestamp: Date.now() });
      }

      let promptTokens = 0;
      let completionTokens = 0;

      let iteration = 0;
      while (iteration++ < MAX_ITERATION) {
        // 3. Stream LLM turn - use fallback model if error threshold exceeded
        const model =
          this.shouldFailover() && this.fallbackModel ? this.fallbackModel : this.writeModel;

        const s = this.llm.streamContextWithModel(model, context);

        for await (const event of s) {
          if (event.type === 'text_delta') {
            subject.next({
              data: JSON.stringify({ kind: 'text_delta', delta: event.delta, conversationId }),
            });
          } else if (event.type === 'toolcall_end') {
            subject.next({
              data: JSON.stringify({
                kind: 'tool_call',
                name: event.toolCall.name,
                callId: event.toolCall.id,
              }),
            });
          } else if (event.type === 'error') {
            this.llm.recordError();
            // pi-ai delivers failures as an AssistantMessage — String() of it
            // renders as "[object Object]". Surface the provider error text.
            const failed = event.error;
            const detail = failed.errorMessage || `LLM stream ${event.reason}`;
            this.logger.warn(`LLM stream error (${failed.provider}/${failed.model}): ${detail}`);
            subject.next({ data: JSON.stringify({ kind: 'error', message: detail }) });
            subject.complete();
            return;
          }
        }

        const finalMessage = await s.result();
        context.messages.push(finalMessage);
        promptTokens += finalMessage.usage.input;
        completionTokens += finalMessage.usage.output;
        this.llm.clearErrors();

        const assistantId = await this.saveAssistantMessage(conversationId, finalMessage);

        // 4. Execute tool calls and stream continuation
        const toolCalls = finalMessage.content.filter((b) => b.type === 'toolCall');
        if (toolCalls.length == 0) {
          break;
        }

        for (const [seq, call] of toolCalls.entries()) {
          if (call.type !== 'toolCall') continue;
          const result = await this.executeTool(call.name, call.arguments, call.id, toolCtx);
          subject.next({
            data: JSON.stringify({
              kind: 'tool_result',
              callId: call.id,
              ok: result.ok,
              data: result.data,
              error: result.error,
            }),
          });

          const resultText = result.ok ? JSON.stringify(result.data) : result.error;
          const toolResultMsg: ToolResultMessage = {
            role: 'toolResult' as const,
            toolCallId: call.id,
            toolName: call.name,
            content: [{ type: 'text' as const, text: resultText }],
            isError: !result.ok,
            timestamp: Date.now(),
          };

          context.messages.push(toolResultMsg);
          await this.saveToolCall(conversationId, assistantId, {
            toolCallId: call.id,
            toolName: call.name,
            seq,
            arguments: call.arguments,
            result: resultText,
            isError: !result.ok,
          });
        }
      }

      await this.finalizeLoop(
        subject,
        conversationId,
        userId,
        iteration,
        promptTokens,
        completionTokens,
      );
    } catch (err) {
      this.logger.error('Agent loop error', err instanceof Error ? err.stack : String(err));
      subject.next({ data: JSON.stringify({ kind: 'error', message: 'Internal agent error' }) });
      subject.complete();
    }
  }

  private async saveUserMessage(
    conversationId: string,
    userMessage: string,
    clientMessageId?: string,
  ): Promise<boolean> {
    return this.convMessages.saveUser(conversationId, userMessage, clientMessageId);
  }

  private async saveAssistantMessage(
    conversationId: string,
    finalMessage: AssistantMessage,
  ): Promise<string> {
    return this.convMessages.saveAssistant(conversationId, finalMessage);
  }

  private async saveToolCall(
    conversationId: string,
    assistantId: string,
    rec: ToolExecutionRecord,
  ): Promise<void> {
    await this.convMessages.saveToolCall(conversationId, assistantId, rec);
  }

  private async finalizeLoop(
    subject: Subject<AgentSseEvent>,
    conversationId: string,
    userId: string,
    iteration: number,
    promptTokens: number,
    completionTokens: number,
  ): Promise<void> {
    // Emit telemetry if the loop exhausted its iteration budget
    if (iteration > MAX_ITERATION) {
      void this.telemetryRepo.save(
        this.telemetryRepo.create({
          id: ulid(),
          eventType: 'agent.iteration_exhausted',
          userId,
          payload: { conversationId },
        }),
      );
    }

    // Enqueue async memory jobs — non-blocking, retried by BullMQ on failure
    await Promise.all([
      this.memoryQueue.add('compress', { type: 'COMPRESS_CONVERSATION', conversationId }),
      this.memoryQueue.add('extract', { type: 'EXTRACT_PREFERENCES', conversationId, userId }),
    ]);

    await this.convRepo.update({ id: conversationId }, { lastActivity: new Date() });

    subject.next({ data: JSON.stringify({ kind: 'done', promptTokens, completionTokens }) });
    subject.complete();
  }

  private async executeTool(
    toolName: string,
    args: unknown,
    callId: string,
    ctx: ToolContext,
  ): Promise<{ ok: boolean; data: Record<string, unknown>; error: string }> {
    const executor = this.toolRegistry.get(toolName);
    if (!executor) return { ok: false, data: {}, error: `Unknown tool: ${toolName}` };

    try {
      const previous = await this.convMessages.findToolResult(ctx.conversationId, callId);
      if (previous) {
        if (previous.isError) return { ok: false, data: {}, error: previous.result };
        try {
          return {
            ok: true,
            data: JSON.parse(previous.result) as Record<string, unknown>,
            error: '',
          };
        } catch {
          return { ok: true, data: { text: previous.result }, error: '' };
        }
      }
      const validArgs = this.toolRegistry.validateArguments(toolName, args);
      // Execute with 90s timeout
      const result = await doWithTimeout(
        executor.execute(callId, validArgs, ctx),
        90_000,
        toolName,
      );
      // const result = await Promise.race([
      //   executor.execute(callId, args, ctx),
      //   new Promise<never>((_, reject) =>
      //     setTimeout(() => reject(new Error('Tool timeout exceeded (90s)')), TOOL_TIMEOUT_MS),
      //   ),
      // ]);
      const text = result.content.map((c) => c.text).join('\n');
      const successResult = { ok: true, data: { text, ...result.details }, error: '' };

      // Persist asynchronously — off the hot path so tool latency is not inflated
      // by synchronous DB round-trips. Tool results are also persisted to conv_messages.
      void this.pendingToolRepo.save(
        this.pendingToolRepo.create({
          id: ulid(),
          conversationId: ctx.conversationId,
          toolName,
          toolCallId: callId,
          result: successResult.data,
          error: null,
          acknowledged: true,
        }),
      );

      return successResult;
    } catch (err) {
      this.logger.error(`Tool ${toolName} failed`, err);
      const errorResult = { ok: false, data: {}, error: String(err) };

      void this.pendingToolRepo.save(
        this.pendingToolRepo.create({
          id: ulid(),
          conversationId: ctx.conversationId,
          toolName,
          toolCallId: callId,
          result: null,
          error: { message: errorResult.error },
          acknowledged: true,
        }),
      );

      return errorResult;
    }
  }

  private shouldFailover(): boolean {
    const now = Date.now();
    if (now - this.errorLastAt > 60000) this.errorCount = 0;
    return this.errorCount >= 5;
  }

  getProviderState(): {
    activeProvider: string;
    fallbackProvider: string;
    errorCount: number;
    inFailover: boolean;
  } {
    const llmConfig = this.configService.get('llm', { infer: true })!;
    return {
      activeProvider: this.shouldFailover() ? llmConfig.fallbackProvider : llmConfig.provider,
      fallbackProvider: llmConfig.fallbackProvider,
      errorCount: this.errorCount,
      inFailover: this.shouldFailover(),
    };
  }
}
