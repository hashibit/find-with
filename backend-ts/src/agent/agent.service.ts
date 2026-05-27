import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Observable, Subject } from 'rxjs';
import { ConvMessage } from '../database/entities/conversation/message.entity';
import { ConvConversation } from '../database/entities/conversation/conversation.entity';
import { LlmService, MODEL_WRITE, ToolDef, LLMMessage } from '../llm/llm.service';
import { ContextBuilderService } from './context-builder.service';
import { SearchCompanyTool } from './tools/search-company.tool';
import { MineShiningPointTool } from './tools/mine-shining-point.tool';
import { DraftMotivationTool } from './tools/draft-motivation.tool';
import { ClassifyEmailTool } from './tools/classify-email.tool';
import { DraftReplyTool } from './tools/draft-reply.tool';
import { SetConversationDensityTool } from './tools/set-conversation-density.tool';
import { ulid } from 'ulid';

export interface AgentSseEvent {
  data: string;
  type?: string;
}

interface ToolExecutor {
  readonly name: string;
  readonly description: string;
  readonly parameters: unknown;
  execute(toolCallId: string, params: Record<string, unknown>, context: ToolContext): Promise<{
    content: Array<{ type: string; text: string }>;
    details: Record<string, unknown>;
  }>;
}

interface ToolContext {
  userId: string;
  conversationId: string;
}

// Tool scene mapping (mirrors Python ToolRegistry)
const TOOL_SCENES: Record<string, string[]> = {
  search_company: ['JOB_ANALYSIS'],
  mine_shining_point: ['ONBOARDING', 'GAP_MINING'],
  generate_tailored_resume: ['TAILOR_EDIT'],
  edit_bullet: ['TAILOR_EDIT'],
  re_apply_material_to_tailoring: ['GAP_MINING', 'TAILOR_EDIT'],
  recompute_match: ['TAILOR_EDIT'],
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
    @InjectRepository(ConvMessage)
    private readonly messageRepo: Repository<ConvMessage>,
    @InjectRepository(ConvConversation)
    private readonly convRepo: Repository<ConvConversation>,
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

  /**
   * Process a user message and return an Observable that emits SSE events.
   * Mirrors Python AgentOrchestrator.respond() but as an Observable stream.
   */
  respond(
    conversationId: string,
    userId: string,
    userMessage: string,
    conversationKind = 'FREE_CHAT',
    anchorId?: string | null,
  ): Observable<AgentSseEvent> {
    const subject = new Subject<AgentSseEvent>();

    void this.runAgentLoop(subject, {
      conversationId,
      userId,
      userMessage,
      conversationKind,
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
      conversationKind: string;
      anchorId?: string | null;
    },
  ): Promise<void> {
    const { conversationId, userId, userMessage, conversationKind, anchorId } = opts;
    const toolCtx: ToolContext = { userId, conversationId };

    try {
      // 1. Persist user message
      const userMsgEntity = this.messageRepo.create({
        id: ulid(),
        conversationId,
        role: 'USER',
        text: userMessage,
      });
      await this.messageRepo.save(userMsgEntity);

      // 2. Build context messages
      const messages = await this.contextBuilder.build(conversationId, userId, conversationKind, anchorId);
      messages.push({ role: 'user', content: userMessage });

      // 3. Get tools for this scene
      const toolDefs = this.getToolsForScene(conversationKind);

      // 4. Stream LLM response
      let fullText = '';
      const pendingToolCalls: Array<{ name: string; args: string; callId: string }> = [];
      let promptTokens = 0;
      let completionTokens = 0;
      let finishReason = '';

      for await (const event of this.llm.stream(MODEL_WRITE, messages, toolDefs)) {
        if (event.kind === 'text_delta') {
          fullText += event.delta!;
          subject.next({ data: JSON.stringify({ kind: 'text_delta', delta: event.delta, conversationId }) });
        } else if (event.kind === 'tool_call') {
          pendingToolCalls.push({
            name: event.toolName!,
            args: event.toolArgs!,
            callId: event.toolCallId!,
          });
          subject.next({ data: JSON.stringify({ kind: 'tool_call', name: event.toolName, callId: event.toolCallId }) });
        } else if (event.kind === 'done') {
          promptTokens = event.promptTokens ?? 0;
          completionTokens = event.completionTokens ?? 0;
          finishReason = event.finishReason ?? '';
        } else if (event.kind === 'error') {
          subject.next({ data: JSON.stringify({ kind: 'error', message: event.error }) });
          subject.complete();
          return;
        }
      }

      // 5. Execute tool calls sequentially
      for (const tc of pendingToolCalls) {
        const result = await this.executeTool(tc.name, tc.args, tc.callId, toolCtx);

        subject.next({
          data: JSON.stringify({
            kind: 'tool_result',
            callId: tc.callId,
            ok: result.ok,
            data: result.data,
            error: result.error,
          }),
        });

        if (result.ok && result.mode === 'SYNC') {
          // Append tool exchange to messages and get LLM continuation
          const updatedMessages: LLMMessage[] = [
            ...messages,
            {
              role: 'assistant',
              content: fullText,
              toolCalls: [{ id: tc.callId, type: 'function', function: { name: tc.name, arguments: tc.args } }],
            },
            { role: 'tool', content: JSON.stringify(result.data), toolCallId: tc.callId, name: tc.name },
          ];

          fullText = '';
          for await (const contEvent of this.llm.stream(MODEL_WRITE, updatedMessages, toolDefs)) {
            if (contEvent.kind === 'text_delta') {
              fullText += contEvent.delta!;
              subject.next({ data: JSON.stringify({ kind: 'text_delta', delta: contEvent.delta, conversationId }) });
            } else if (contEvent.kind === 'done') {
              promptTokens += contEvent.promptTokens ?? 0;
              completionTokens += contEvent.completionTokens ?? 0;
            }
          }
        } else if (result.mode === 'ASYNC') {
          subject.next({ data: JSON.stringify({ kind: 'state_change', key: 'generating', value: result.taskId ?? '' }) });
        }
      }

      // 6. Persist assistant message
      const assistantMsgEntity = this.messageRepo.create({
        id: ulid(),
        conversationId,
        role: 'ASSISTANT',
        text: fullText || null,
        toolCalls: pendingToolCalls.length > 0 ? pendingToolCalls : null,
        tokenPrompt: promptTokens,
        tokenCompletion: completionTokens,
        tokenModel: MODEL_WRITE,
        finishReason,
      });
      await this.messageRepo.save(assistantMsgEntity);

      // 7. Update conversation last_activity
      await this.convRepo.update({ id: conversationId }, { lastActivity: new Date() });

      subject.next({ data: JSON.stringify({ kind: 'done', promptTokens, completionTokens, finishReason }) });
      subject.complete();
    } catch (err) {
      this.logger.error('Agent loop error', err instanceof Error ? err.stack : String(err));
      subject.next({ data: JSON.stringify({ kind: 'error', message: 'Internal agent error' }) });
      subject.complete();
    }
  }

  private async executeTool(
    toolName: string,
    argsJson: string,
    callId: string,
    ctx: ToolContext,
  ): Promise<{ ok: boolean; data: Record<string, unknown>; error: string; mode: string; taskId?: string }> {
    const executor = this.toolMap.get(toolName);
    if (!executor) {
      return { ok: false, data: {}, error: `Unknown tool: ${toolName}`, mode: 'SYNC' };
    }

    let args: Record<string, unknown> = {};
    try {
      args = argsJson ? (JSON.parse(argsJson) as Record<string, unknown>) : {};
    } catch {
      return { ok: false, data: {}, error: `Invalid tool arguments JSON`, mode: 'SYNC' };
    }

    try {
      const result = await executor.execute(callId, args, ctx);
      const text = result.content.map((c) => c.text).join('\n');
      return { ok: true, data: { text, ...result.details }, error: '', mode: 'SYNC' };
    } catch (err) {
      this.logger.error(`Tool ${toolName} failed`, err);
      return { ok: false, data: {}, error: String(err), mode: 'SYNC' };
    }
  }

  private getToolsForScene(conversationKind: string): ToolDef[] {
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
