import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Observable, Subject } from 'rxjs';
import { type Context, type Tool } from '@earendil-works/pi-ai';
import { ConvMessage } from '../database/entities/conversation/message.entity.js';
import { ConvConversation } from '../database/entities/conversation/conversation.entity.js';
import { LlmService } from '../llm/llm.service.js';
import { ContextBuilderService } from './context-builder.service.js';
import { SearchCompanyTool } from './tools/search-company.tool.js';
import { MineShiningPointTool } from './tools/mine-shining-point.tool.js';
import { DraftMotivationTool } from './tools/draft-motivation.tool.js';
import { ClassifyEmailTool } from './tools/classify-email.tool.js';
import { DraftReplyTool } from './tools/draft-reply.tool.js';
import { SetConversationDensityTool } from './tools/set-conversation-density.tool.js';
import { ulid } from 'ulid';

export interface AgentSseEvent {
  data: string;
  type?: string;
}

interface ToolExecutor {
  readonly name: string;
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

// Scene → allowed tools (mirrors Python ToolRegistry)
const TOOL_SCENES: Record<string, string[]> = {
  search_company: ['JOB_ANALYSIS'],
  mine_shining_point: ['ONBOARDING', 'GAP_MINING'],
  draft_motivation: ['TAILOR_EDIT'],
  classify_email: ['FOLLOWUP'],
  draft_reply: ['FOLLOWUP'],
  set_conversation_density: ['ALL'],
};

@Injectable()
export class AgentService {
  private readonly logger = new Logger(AgentService.name);
  private readonly toolMap: Map<string, ToolExecutor>;

  constructor(
    @InjectRepository(ConvMessage) private readonly messageRepo: Repository<ConvMessage>,
    @InjectRepository(ConvConversation) private readonly convRepo: Repository<ConvConversation>,
    private readonly llm: LlmService,
    private readonly contextBuilder: ContextBuilderService,
    private readonly searchCompanyTool: SearchCompanyTool,
    private readonly mineShiningPointTool: MineShiningPointTool,
    private readonly draftMotivationTool: DraftMotivationTool,
    private readonly classifyEmailTool: ClassifyEmailTool,
    private readonly draftReplyTool: DraftReplyTool,
    private readonly setDensityTool: SetConversationDensityTool,
  ) {
    this.toolMap = new Map([
      [this.searchCompanyTool.name, this.searchCompanyTool as unknown as ToolExecutor],
      [this.mineShiningPointTool.name, this.mineShiningPointTool as unknown as ToolExecutor],
      [this.draftMotivationTool.name, this.draftMotivationTool as unknown as ToolExecutor],
      [this.classifyEmailTool.name, this.classifyEmailTool as unknown as ToolExecutor],
      [this.draftReplyTool.name, this.draftReplyTool as unknown as ToolExecutor],
      [this.setDensityTool.name, this.setDensityTool as unknown as ToolExecutor],
    ]);
  }

  respond(
    conversationId: string,
    userId: string,
    userMessage: string,
    conversationKind = 'FREE_CHAT',
    anchorId?: string | null,
  ): Observable<AgentSseEvent> {
    const subject = new Subject<AgentSseEvent>();
    void this.runAgentLoop(subject, { conversationId, userId, userMessage, conversationKind, anchorId });
    return subject.asObservable();
  }

  private async runAgentLoop(
    subject: Subject<AgentSseEvent>,
    opts: {
      conversationId: string;
      userId: string;
      userMessage: string;
      conversationKind: string;
      anchorId?: string | null;
    },
  ): Promise<void> {
    const { conversationId, userId, userMessage, conversationKind } = opts;
    const toolCtx: ToolContext = { userId, conversationId };

    try {
      // 1. Persist user message
      await this.messageRepo.save(
        this.messageRepo.create({ id: ulid(), conversationId, role: 'USER', text: userMessage }),
      );

      // 2. Build pi-ai Context (system prompt + history)
      const context: Context = await this.contextBuilder.build(
        conversationId, userId, conversationKind, opts.anchorId,
      );

      // Attach scene-filtered tools for the LLM to see
      context.tools = this.getToolsForScene(conversationKind);

      // Add the current user turn
      context.messages.push({ role: 'user', content: userMessage, timestamp: Date.now() });

      // 3. Stream first LLM turn
      let fullText = '';
      let promptTokens = 0;
      let completionTokens = 0;

      const s = this.llm.streamContext(context);

      for await (const event of s) {
        if (event.type === 'text_delta') {
          fullText += event.delta;
          subject.next({ data: JSON.stringify({ kind: 'text_delta', delta: event.delta, conversationId }) });
        } else if (event.type === 'toolcall_end') {
          subject.next({ data: JSON.stringify({ kind: 'tool_call', name: event.toolCall.name, callId: event.toolCall.id }) });
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

      // 4. Execute tool calls and stream continuation
      const toolCalls = finalMessage.content.filter((b) => b.type === 'toolCall');

      for (const call of toolCalls) {
        if (call.type !== 'toolCall') continue;

        const result = await this.executeTool(call.name, call.arguments as Record<string, unknown>, call.id, toolCtx);

        subject.next({
          data: JSON.stringify({ kind: 'tool_result', callId: call.id, ok: result.ok, data: result.data, error: result.error }),
        });

        // Add tool result to context and get continuation
        context.messages.push({
          role: 'toolResult',
          toolCallId: call.id,
          toolName: call.name,
          content: [{ type: 'text', text: result.ok ? JSON.stringify(result.data) : result.error }],
          isError: !result.ok,
          timestamp: Date.now(),
        });
      }

      if (toolCalls.length > 0) {
        fullText = '';
        const s2 = this.llm.streamContext(context);

        for await (const event of s2) {
          if (event.type === 'text_delta') {
            fullText += event.delta;
            subject.next({ data: JSON.stringify({ kind: 'text_delta', delta: event.delta, conversationId }) });
          }
        }

        const finalMessage2 = await s2.result();
        promptTokens += finalMessage2.usage.input;
        completionTokens += finalMessage2.usage.output;
        fullText = fullText || (finalMessage2.content.find((b) => b.type === 'text')?.type === 'text'
          ? (finalMessage2.content.find((b) => b.type === 'text') as { type: 'text'; text: string }).text
          : '');
      }

      // 5. Persist assistant message
      await this.messageRepo.save(
        this.messageRepo.create({
          id: ulid(),
          conversationId,
          role: 'ASSISTANT',
          text: fullText || null,
          tokenPrompt: promptTokens,
          tokenCompletion: completionTokens,
          finishReason: finalMessage.stopReason ?? '',
        }),
      );

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
      const result = await executor.execute(callId, args, ctx);
      const text = result.content.map((c) => c.text).join('\n');
      return { ok: true, data: { text, ...result.details }, error: '' };
    } catch (err) {
      this.logger.error(`Tool ${toolName} failed`, err);
      return { ok: false, data: {}, error: String(err) };
    }
  }

  private getToolsForScene(conversationKind: string): Tool[] {
    return Array.from(this.toolMap.values())
      .filter((tool) => {
        const scenes = TOOL_SCENES[tool.name] ?? [];
        return scenes.includes('ALL') || scenes.includes(conversationKind);
      })
      .map((tool) => ({
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters as Record<string, unknown>,
      }));
  }
}
