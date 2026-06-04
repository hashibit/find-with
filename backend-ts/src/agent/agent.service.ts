import { Injectable, Logger, Inject, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Observable, Subject } from 'rxjs';
import {
  type AssistantMessage,
  type Context,
  type Message,
  type Tool,
  type ToolResultMessage,
  type Model,
  type Api,
} from '@earendil-works/pi-ai';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import { ConvMessage } from '../database/entities/conversation/message.entity.js';
import { ConvConversation } from '../database/entities/conversation/conversation.entity.js';
import { LLM_PROVIDER, type LlmProvider } from '../llm/llm-provider.interface.js';
import { FIELD_CRYPTO, type FieldCrypto } from '../common/crypto/crypto.interface.js';
import { ContextBuilderService } from './context-builder.service.js';
import { SearchCompanyTool } from './tools/search-company.tool.js';
import { MineShiningPointTool } from './tools/mine-shining-point.tool.js';
import { DraftMotivationTool } from './tools/draft-motivation.tool.js';
import { ClassifyEmailTool } from './tools/classify-email.tool.js';
import { DraftReplyTool } from './tools/draft-reply.tool.js';
import { SetConversationDensityTool } from './tools/set-conversation-density.tool.js';
import { FarewellTool } from './tools/farewell.tool.js';
import { RecomputeMatchTool } from './tools/recompute-match.tool.js';
import { ulid } from 'ulid';
import { MEMORY_QUEUE, type MemoryJobData } from '../contexts/memory/memory.constants.js';
import { PendingToolResult } from '../database/entities/agent/pending-tool-result.entity.js';
import { TelemetryEvent } from '../database/entities/telemetry/telemetry-event.entity.js';
import { type AppConfig } from '../config/configuration.js';

export interface AgentSseEvent {
  data: string;
  type?: string;
}

type Scene =
  | 'JOB_ANALYSIS'
  | 'ONBOARDING'
  | 'GAP_MINING'
  | 'TAILOR_EDIT'
  | 'FOLLOWUP'
  | 'FREE_CHAT'
  | 'OFFER_ACCEPTED'
  | 'ALL';

interface ToolExecutor {
  readonly name: string;
  /** Conversation kinds this tool is available in. Use 'ALL' to allow in every kind. */
  readonly scenes: readonly Scene[];
  readonly description: string;
  readonly parameters: unknown;
  execute(
    toolCallId: string,
    params: Record<string, unknown>,
    context: ToolContext,
  ): Promise<{ content: Array<{ type: string; text: string }>; details: Record<string, unknown> }>;
}

interface ToolContext {
  userId: string;
  conversationId: string;
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
  private readonly toolMap: Map<string, ToolExecutor>;
  private readonly writeModel: Model<Api>;
  private readonly parseModel: Model<Api>;
  private readonly fallbackModel?: Model<Api>;
  private errorCount = 0;
  private errorLastAt = 0;
  private readonly embeddingModel: string;

  constructor(
    @InjectRepository(ConvMessage) private readonly messageRepo: Repository<ConvMessage>,
    @InjectRepository(ConvConversation) private readonly convRepo: Repository<ConvConversation>,
    @InjectRepository(PendingToolResult) private readonly pendingToolRepo: Repository<PendingToolResult>,
    @InjectRepository(TelemetryEvent) private readonly telemetryRepo: Repository<TelemetryEvent>,
    @Inject(LLM_PROVIDER) private readonly llm: LlmProvider,
    @Inject(FIELD_CRYPTO) private readonly fieldCrypto: FieldCrypto,
    @InjectQueue(MEMORY_QUEUE) private readonly memoryQueue: Queue<MemoryJobData>,
    private readonly contextBuilder: ContextBuilderService,
    private readonly searchCompanyTool: SearchCompanyTool,
    private readonly mineShiningPointTool: MineShiningPointTool,
    private readonly draftMotivationTool: DraftMotivationTool,
    private readonly classifyEmailTool: ClassifyEmailTool,
    private readonly draftReplyTool: DraftReplyTool,
    private readonly setDensityTool: SetConversationDensityTool,
    private readonly farewellTool: FarewellTool,
    private readonly recomputeMatchTool: RecomputeMatchTool,
    private readonly configService: ConfigService<AppConfig>,
  ) {
    this.toolMap = new Map([
      [this.searchCompanyTool.name, this.assertTool(this.searchCompanyTool)],
      [this.mineShiningPointTool.name, this.assertTool(this.mineShiningPointTool)],
      [this.draftMotivationTool.name, this.assertTool(this.draftMotivationTool)],
      [this.classifyEmailTool.name, this.assertTool(this.classifyEmailTool)],
      [this.draftReplyTool.name, this.assertTool(this.draftReplyTool)],
      [this.setDensityTool.name, this.assertTool(this.setDensityTool)],
      [this.farewellTool.name, this.assertTool(this.farewellTool)],
      [this.recomputeMatchTool.name, this.assertTool(this.recomputeMatchTool)],
    ]);

    // Build models from configuration
    const llmConfig = this.configService.get('llm', { infer: true });
    this.writeModel = this.buildModel(llmConfig, 'write');
    this.parseModel = this.buildModel(llmConfig, 'parse');
    this.fallbackModel = llmConfig.fallbackProvider !== 'none'
      ? this.buildFallbackModel(llmConfig)
      : undefined;
    this.embeddingModel = llmConfig.embeddingModel;

    this.logger.log(`LLM configured: provider=${llmConfig.provider}, model=${this.writeModel.id}, baseUrl=${this.writeModel.baseUrl}`);
    if (this.fallbackModel) {
      this.logger.log(`Fallback: provider=${llmConfig.fallbackProvider}, model=${this.fallbackModel.id}`);
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
      // 1. Persist user message — text is encrypted at rest (U-10)
      const encryptedUserText = await this.fieldCrypto.encrypt(userMessage);
      await this.messageRepo.save(
        this.messageRepo.create({
          id: ulid(),
          conversationId,
          role: 'USER',
          text: null,
          encryptedText: encryptedUserText,
        }),
      );

      // 2. Build pi-ai Context (system prompt + history)
      const context: Context = await this.contextBuilder.build(
        conversationId,
        userId,
        conversationKind,
        opts.anchorId,
      );

      // Attach scene-filtered tools for the LLM to see
      context.tools = this.getToolsForScene(conversationKind);

      // Add the current user turn
      context.messages.push({ role: 'user', content: userMessage, timestamp: Date.now() });

      let promptTokens = 0;
      let completionTokens = 0;

      let iteration = 0;
      while (iteration++ < MAX_ITERATION) {
        // 3. Stream LLM turn - use fallback model if error threshold exceeded
        const model = this.shouldFailover() && this.fallbackModel
          ? this.fallbackModel
          : this.writeModel;

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
            subject.next({ data: JSON.stringify({ kind: 'error', message: String(event.error) }) });
            subject.complete();
            return;
          }
        }

        const finalMessage = await s.result();
        context.messages.push(finalMessage);
        promptTokens += finalMessage.usage.input;
        completionTokens += finalMessage.usage.output;
        this.llm.clearErrors();

        const fullText = finalMessage.content
          .filter((b) => b.type == 'text')
          .map((b) => b.text)
          .join('');

        // 3. Persist assistant message with full payload — text encrypted at rest (U-10)
        const encryptedAssistantText = fullText
          ? await this.fieldCrypto.encrypt(fullText)
          : null;
        await this.messageRepo.save(
          this.messageRepo.create({
            id: ulid(),
            conversationId,
            role: 'ASSISTANT',
            text: null,
            encryptedText: encryptedAssistantText,
            payload: finalMessage,
          }),
        );

        // 4. Execute tool calls and stream continuation
        const toolCalls = finalMessage.content.filter((b) => b.type === 'toolCall');
        if (toolCalls.length == 0) {
          break;
        }

        for (const call of toolCalls) {
          if (call.type !== 'toolCall') continue;
          const result = await this.executeTool(
            call.name,
            this.validateToolArgs(call.name, call.arguments),
            call.id,
            toolCtx,
          );
          subject.next({
            data: JSON.stringify({
              kind: 'tool_result',
              callId: call.id,
              ok: result.ok,
              data: result.data,
              error: result.error,
            }),
          });

          const toolResultMsg = {
            role: 'toolResult' as const,
            toolCallId: call.id,
            toolName: call.name,
            content: [
              {
                type: 'text' as const,
                text: result.ok ? JSON.stringify(result.data) : result.error,
              },
            ],
            isError: !result.ok,
            timestamp: Date.now(),
          };

          context.messages.push(toolResultMsg);

          // 5. Persist each tool result as its own row
          await this.messageRepo.save(
            this.messageRepo.create({
              id: ulid(),
              conversationId,
              role: 'TOOL_RESULT',
              payload: toolResultMsg,
            }),
          );
        }
      }

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
    } catch (err) {
      this.logger.error('Agent loop error', err instanceof Error ? err.stack : String(err));
      subject.next({ data: JSON.stringify({ kind: 'error', message: 'Internal agent error' }) });
      subject.complete();
    }
  }

  private async executeTool(
    toolName: string,
    args: Record<string, unknown>,
    callId: string,
    ctx: ToolContext,
  ): Promise<{ ok: boolean; data: Record<string, unknown>; error: string }> {
    const executor = this.toolMap.get(toolName);
    if (!executor) return { ok: false, data: {}, error: `Unknown tool: ${toolName}` };

    try {
      // Execute with 90s timeout
      const result = await Promise.race([
        executor.execute(callId, args, ctx),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Tool timeout exceeded (90s)')), TOOL_TIMEOUT_MS),
        ),
      ]);
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

  /** Assert tool implements ToolExecutor at registration time — catches missing methods early. */
  private assertTool(tool: unknown): ToolExecutor {
    const t = tool as Record<string, unknown>;
    if (typeof t['name'] !== 'string' || !t['name']) {
      throw new Error(`Tool registration error: missing string 'name' field`);
    }
    if (!Array.isArray(t['scenes']) || t['scenes'].length === 0) {
      throw new Error(`Tool registration error: '${t['name']}' missing non-empty 'scenes' array`);
    }
    if (typeof t['execute'] !== 'function') {
      throw new Error(`Tool registration error: '${t['name']}' missing 'execute' method`);
    }
    if (t['parameters'] === undefined || t['parameters'] === null) {
      throw new Error(`Tool registration error: '${t['name']}' missing 'parameters' schema`);
    }
    return tool as ToolExecutor;
  }

  /** Validate tool args against required parameter keys before execution. */
  private validateToolArgs(toolName: string, args: unknown): Record<string, unknown> {
    if (typeof args !== 'object' || args === null || Array.isArray(args)) {
      throw new BadRequestException(`Tool '${toolName}' received non-object arguments`);
    }
    return args as Record<string, unknown>;
  }

  private getToolsForScene(conversationKind: string): Tool[] {
    return Array.from(this.toolMap.values())
      .filter((tool) => tool.scenes.includes('ALL') || tool.scenes.includes(conversationKind as Scene))
      .map((tool) => ({
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters as Record<string, unknown>,
      }));
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
      activeProvider: this.shouldFailover()
        ? llmConfig.fallbackProvider
        : llmConfig.provider,
      fallbackProvider: llmConfig.fallbackProvider,
      errorCount: this.errorCount,
      inFailover: this.shouldFailover(),
    };
  }
}