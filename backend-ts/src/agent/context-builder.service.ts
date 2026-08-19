import { Injectable, Inject } from '@nestjs/common';
import {
  QUINN_PROMPT_PROVIDER,
  type QuinnPromptProvider,
} from './prompts/quinn-prompt.provider.js';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { type AssistantMessage, type Context, type ToolResultMessage } from '@earendil-works/pi-ai';
import { ConvMessageRepository } from './conv-message.repository.js';

import { ConvMessage } from '../database/entities/conversation/message.entity.js';
import { ConvConversation } from '../database/entities/conversation/conversation.entity.js';
import { ConvRollingSummary } from '@/database/entities/conversation/rolling-summary.entity.js';

import { ProfileProfile } from '../database/entities/profile/profile.entity.js';
import { JobParsedJd } from '../database/entities/jobs/parsed-jd.entity.js';
import { SemanticMaterialLoaderService } from './semantic-material-loader.service.js';
import { JobRadarItem } from '../database/entities/jobs/radar-item.entity.js';
import { UserGoalMemory } from '../database/entities/memory/user-goal-memory.entity.js';
import { resolveDensity, densityInstruction } from '../common/density-resolver.js';

import nunjucks from 'nunjucks';

import { PinoLogger, InjectPinoLogger } from 'nestjs-pino';
import { convertTools } from '@earendil-works/pi-ai/api/google-shared';

const QUINN_SYSTEM_PROMPT_TEMPLATE = `{{ basePrompt }}
{% if goalMemory %}

{{ goalMemory }}
{% endif %}
{% if crossSessionContext %}

{{ crossSessionContext }}
{% endif %}
{% if profile %}

# User profile
Name: {{ profile.fullName }}
Email: {{ profile.email }}
{% endif %}
{% if materials.length %}

# User's confirmed shining points (material library)
{% for m in materials %}- {{ m.shiningText }} [{{ m.tags }}]
{% endfor %}
{% endif %}
{% if summaries.length %}

# Conversation summaries so far
{{ summaries | join("\n\n----\n\n") }}
{% endif %}`;

const ROLLING_SUMMARY_PROMPT = `You are summarizing a segment of a job search conversation between a user and Quinn (an AI job search companion).

  Write a concise summary of the messages provided. Focus on:
  - Jobs or companies discussed, and the user's interest level (decided to apply / skipped / undecided)
  - Key facts the user stated about their experience or background
  - Decisions made
  - Open threads — things that were raised but not resolved

  Do NOT include:
  - General preferences or personality traits — those are tracked elsewhere
  - Filler turns (greetings, acknowledgements)
  - Information already covered in the background context

  Write in third-person, past tense. Plain text, no headers. Under 200 words.`;

export const MOST_RECENT_MESSAGES = 30;
export const MAX_ROLLING_SUMMARIES = 20;
export const MAX_MATERIALS = 20;
export const TOKEN_COMPRESS_THRESHOLD = 10000;
export const ROLLING_MESSAGES_WINDOW = 20;

type CompressableMessages = {
  start_message_id?: string;
  end_message_id?: string;
  messages: string[];
};

// cosineSimilarity removed — now in SemanticMaterialLoaderService via common/math.ts

@Injectable()
export class ContextBuilderService {
  constructor(
    @InjectRepository(ConvMessage)
    private readonly messageRepo: Repository<ConvMessage>,
    @InjectRepository(ConvConversation)
    private readonly convRepo: Repository<ConvConversation>,
    @InjectRepository(ConvRollingSummary)
    private readonly rollingSummayRepo: Repository<ConvRollingSummary>,
    @InjectRepository(ProfileProfile)
    private readonly profileRepo: Repository<ProfileProfile>,
    private readonly materialLoader: SemanticMaterialLoaderService,
    @InjectRepository(JobParsedJd)
    private readonly parsedJdRepo: Repository<JobParsedJd>,
    @InjectRepository(JobRadarItem)
    private readonly radarItemRepo: Repository<JobRadarItem>,
    @InjectRepository(UserGoalMemory)
    private readonly goalMemoryRepo: Repository<UserGoalMemory>,
    private readonly convMessages: ConvMessageRepository,
    @InjectPinoLogger(ContextBuilderService.name)
    private readonly logger: PinoLogger,
    @Inject(QUINN_PROMPT_PROVIDER)
    private readonly promptProvider: QuinnPromptProvider,
  ) {}

  async build(
    conversationId: string,
    userId: string,
    conversationKind: string,
    anchorId?: string | null,
  ): Promise<Context> {
    // Resolve JD embedding for semantic material search (Layer 3)
    let jdEmbedding: number[] | null = null;
    if (anchorId) {
      jdEmbedding = await this.resolveJdEmbedding(anchorId);
    }

    const [profile, materials, rollingSummaries, conversation, goalMemory, messages] =
      await Promise.all([
        this.profileRepo.findOne({ where: { userId } }),
        this.materialLoader.loadForPromptContext(userId, jdEmbedding),
        this.rollingSummayRepo.find({
          where: { conversationId: conversationId },
          take: MAX_ROLLING_SUMMARIES,
          order: { createdAt: 'ASC' },
        }),
        this.convRepo.findOne({ where: { id: conversationId } }),
        this.goalMemoryRepo.findOne({ where: { userId } }),
        this.convMessages.findRecentForContext(conversationId, MOST_RECENT_MESSAGES),
      ]);

    materials.reverse();

    if (materials.length >= MAX_MATERIALS) {
      this.logger.warn(`materials count reach maximun value.${MAX_MATERIALS}`);
    }
    if (rollingSummaries.length > MAX_ROLLING_SUMMARIES) {
      this.logger.warn(`rollingSummaries count reach maximun value.${MAX_ROLLING_SUMMARIES}`);
    }

    // Layer 4: goal memory context
    const goalMemorySection = this.buildGoalMemorySection(goalMemory);

    // Layer 2 cross-session: summaries from recent conversations of the same kind
    const crossSessionContext = await this.buildCrossSessionContext(
      userId,
      conversationKind,
      conversationId,
    );

    const info = profile?.basicInfo as Record<string, unknown> | undefined;
    let systemPrompt = nunjucks.renderString(QUINN_SYSTEM_PROMPT_TEMPLATE, {
      basePrompt: this.promptProvider.systemPrompt,
      goalMemory: goalMemorySection,
      crossSessionContext,
      profile: info
        ? { fullName: info['fullName'] ?? 'Unknown', email: info['email'] ?? 'Unknown' }
        : null,
      materials: materials.slice(0, MAX_MATERIALS).map((m) => ({
        shiningText: m.shiningText ?? '(no shining text)',
        tags: (m.tags ?? []).join(', '),
      })),
      summaries: rollingSummaries.map((s) => s.content),
    });

    // Append density instruction — effectiveDensity is set by set_conversation_density tool
    // and defaults to BALANCED (which is already described in the base Quinn prompt).
    // TODO: pass IamSettings.density as globalDensity once IamSettings is accessible here.
    const density = resolveDensity(conversation?.effectiveDensity, null);
    systemPrompt += densityInstruction(density);

    return { systemPrompt, messages };
  }

  async findMessagesToCompress(conversationId: string): Promise<CompressableMessages> {
    const query = {
      where: { conversationId: conversationId, archived: false },
      order: { createdAt: 'ASC' },
    };
    const count = await this.messageRepo.count(query as any);
    if (count < ROLLING_MESSAGES_WINDOW) {
      return { messages: [] };
    }

    const convMessages = await this.messageRepo.find(query as any);
    if (convMessages.length < ROLLING_MESSAGES_WINDOW) {
      return { messages: [] };
    }

    const start_message_id = convMessages[0]!.id;
    const end_message_id = convMessages[convMessages.length - 1]!.id;
    const messages: string[] = [];

    const tokens = convMessages.reduce((sum, convMessage) => {
      const brief = this.messageBrief(convMessage);
      if (brief) {
        messages.push(brief);
      }
      if (convMessage.role == 'USER') {
        return sum + this.estimateStringTokens(convMessage.text);
      }
      if (convMessage.role == 'ASSISTANT') {
        return sum + (convMessage.payload as AssistantMessage).usage.totalTokens;
      }
      if (convMessage.role == 'TOOL_RESULT') {
        const content = (convMessage.payload as ToolResultMessage).content;
        const tool_tokens = content.reduce((v, c) => {
          if (c.type == 'text') return v + this.estimateStringTokens(c.text);
          return v + c.data.length / 3;
        }, 0);
        return sum + tool_tokens;
      }
      return sum;
    }, 0);

    if (tokens > TOKEN_COMPRESS_THRESHOLD) {
      return {
        start_message_id,
        end_message_id,
        messages,
      };
    }

    return { messages: [] };
  }

  private async resolveJdEmbedding(anchorId: string): Promise<number[] | null> {
    // anchorId is a radar_item_id — resolve to parsedJdId then get the embedding
    const radarItem = await this.radarItemRepo.findOne({ where: { id: anchorId } });
    if (!radarItem?.parsedJdId) return null;
    const jd = await this.parsedJdRepo.findOne({ where: { id: radarItem.parsedJdId } });
    return jd?.jdEmbedding ?? null;
  }

  private buildGoalMemorySection(goals: UserGoalMemory | null): string {
    if (!goals) return '';

    const parts: string[] = [];
    if (goals.targetRoles.length) parts.push(`Target roles: ${goals.targetRoles.join(', ')}`);
    if (goals.targetIndustries.length)
      parts.push(`Target industries: ${goals.targetIndustries.join(', ')}`);
    if (goals.locationPrefs.length) parts.push(`Location: ${goals.locationPrefs.join(', ')}`);
    if (goals.dealBreakers.length) parts.push(`Deal breakers: ${goals.dealBreakers.join(', ')}`);
    if (goals.preferredStages.length)
      parts.push(`Preferred stages: ${goals.preferredStages.join(', ')}`);
    if (goals.salaryFloorUsd)
      parts.push(`Minimum salary: $${goals.salaryFloorUsd.toLocaleString()}`);
    if (goals.shortTermGoal) parts.push(`Short-term goal: ${goals.shortTermGoal}`);

    if (!parts.length) return '';
    return `## What I know about your preferences\n${parts.join('\n')}`;
  }

  private async buildCrossSessionContext(
    userId: string,
    kind: string,
    excludeId: string,
  ): Promise<string> {
    // Get the latest rolling summary from each of the 2 most recent conversations of the same kind
    const recentConvs = await this.convRepo.find({
      where: { userId, kind },
      order: { updatedAt: 'DESC' },
      take: 5,
    });

    const othersWithSummaries: string[] = [];
    for (const conv of recentConvs) {
      if (conv.id === excludeId) continue;
      const latestSummary = await this.rollingSummayRepo.findOne({
        where: { conversationId: conv.id },
        order: { createdAt: 'DESC' },
      });
      if (latestSummary?.content) {
        othersWithSummaries.push(latestSummary.content);
      }
      if (othersWithSummaries.length >= 2) break;
    }

    if (!othersWithSummaries.length) return '';

    const summaries = othersWithSummaries
      .map((s, i) => `[Session ${i + 1} ago]: ${s}`)
      .join('\n\n');
    return `## Context from previous sessions\n${summaries}`;
  }

  private estimateStringTokens(text: string | null | undefined): number {
    return (text?.length ?? 0) / 3;
  }

  private messageBrief(message: ConvMessage): string | null {
    switch (message.role) {
      case 'USER':
        // encryptedText is intentionally not decrypted in brief — brief is used
        // for token counting only, so a placeholder is fine.
        return `User: ${message.text ?? '[encrypted]'}`;
      case 'ASSISTANT':
        const assistant = message.payload as AssistantMessage;
        const contents = assistant.content.map((c) => {
          switch (c.type) {
            case 'text':
              return c.text;
            case 'toolCall':
              return `[Call tool: ${c.name}]`;
            case 'thinking':
              return null;
          }
        });
        return `Quinn: ${contents.join('\n')}`;
      case 'TOOL_RESULT':
        const toolResult = message.payload as ToolResultMessage;
        const block = toolResult.content[0];
        if (block.type == 'text') {
          return `[Tool Result for ${toolResult.toolName}: ${block.text}]`;
        }
        return null;
      default:
        return null;
    }
  }

  async buildForCompress(
    conversationId: string,
    toCompressed: CompressableMessages,
  ): Promise<Context> {
    const lastRolling = await this.rollingSummayRepo.findOne({
      where: {
        conversationId,
      },
      order: {
        id: 'DESC',
      },
    });
    const userMessageTmpl = `
  {% if lastContent %}
  ## Background context
  Use this ONLY to resolve references. Do NOT repeat or restate it.

  {{ lastContent }}

  ---
  {% endif %}

  ## Messages to summarize
  {{ messages }}
  `;
    const userMessage = nunjucks.renderString(userMessageTmpl, {
      lastContent: lastRolling?.content,
      messages: toCompressed.messages.join('\n'),
    });

    return {
      systemPrompt: ROLLING_SUMMARY_PROMPT,
      messages: [
        {
          role: 'user' as const,
          content: userMessage,
          timestamp: Date.now(),
        },
      ],
    };
  }
}
