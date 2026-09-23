import { Injectable, Inject } from '@nestjs/common';
import {
  QUINN_PROMPT_PROVIDER,
  type QuinnPromptProvider,
} from './prompts/quinn-prompt.provider.js';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { type Context } from '@earendil-works/pi-ai';
import { ConvMessageRepository, type DecryptedTurn } from './conv-message.repository.js';

import { ConvMessage } from '../database/entities/conversation/message.entity.js';
import { ConvConversation } from '../database/entities/conversation/conversation.entity.js';
import { ConvRollingSummary } from '@/database/entities/conversation/rolling-summary.entity.js';

import { ProfileProfile } from '../database/entities/profile/profile.entity.js';
import { JobParsedJd } from '../database/entities/jobs/parsed-jd.entity.js';
import { SemanticMaterialLoaderService } from './semantic-material-loader.service.js';
import { JobRadarItem } from '../database/entities/jobs/radar-item.entity.js';
import { JobMatchResult } from '../database/entities/jobs/match-result.entity.js';
import { JobCompanyBrief } from '../database/entities/jobs/company-brief.entity.js';
import { UserGoalMemory } from '../database/entities/memory/user-goal-memory.entity.js';
import { resolveDensity, densityInstruction } from '../common/density-resolver.js';

import nunjucks from 'nunjucks';

import { PinoLogger, InjectPinoLogger } from 'nestjs-pino';
import { convertTools } from '@earendil-works/pi-ai/api/google-shared';

const QUINN_SYSTEM_PROMPT_TEMPLATE = `{{ basePrompt }}
{% if sceneInstructions %}

{{ sceneInstructions }}
{% endif %}
{% if currentJob %}

# Current job context
{{ currentJob }}
{% endif %}
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

export interface CurrentJobContext {
  radarItemId: string;
  status: string;
  title: string | null;
  company: string | null;
  location: string | null;
  hardSkills: string[];
  niceToHave: string[];
  match: {
    surfaceScore: number | null;
    deepScore: number | null;
    advice: string | null;
    rationale: string | null;
    gaps: string[];
    hits: string[];
  } | null;
  companyBrief: {
    whatTheyDo: string | null;
    sizeStage: string | null;
    recentNews: string[];
  } | null;
}

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
    @InjectRepository(JobMatchResult)
    private readonly matchRepo: Repository<JobMatchResult>,
    @InjectRepository(JobCompanyBrief)
    private readonly companyBriefRepo: Repository<JobCompanyBrief>,
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
    const conversation = await this.convRepo.findOne({ where: { id: conversationId } });
    const effectiveAnchorId = anchorId ?? conversation?.anchorId ?? null;

    // Resolve JD embedding for semantic material search (Layer 3)
    let jdEmbedding: number[] | null = null;
    if (effectiveAnchorId) {
      jdEmbedding = await this.resolveJdEmbedding(effectiveAnchorId);
    }

    const [profile, materials, rollingSummaries, goalMemory, messages] = await Promise.all([
      this.profileRepo.findOne({ where: { userId } }),
      this.materialLoader.loadForPromptContext(userId, jdEmbedding),
      this.rollingSummayRepo.find({
        where: { conversationId: conversationId },
        take: MAX_ROLLING_SUMMARIES,
        order: { createdAt: 'DESC' },
      }),
      this.goalMemoryRepo.findOne({ where: { userId } }),
      this.convMessages.findRecentForContext(conversationId, MOST_RECENT_MESSAGES),
    ]);

    // The semantic loader and fallback both return the most useful material
    // first. Reversing here made the prompt least relevant first.
    const currentJob = await this.loadCurrentJobContext(userId, effectiveAnchorId);
    const orderedSummaries = rollingSummaries.reverse();

    if (materials.length >= MAX_MATERIALS) {
      this.logger.warn(`materials count reach maximun value.${MAX_MATERIALS}`);
    }
    if (rollingSummaries.length > MAX_ROLLING_SUMMARIES) {
      this.logger.warn(`rollingSummaries count reach maximun value.${MAX_ROLLING_SUMMARIES}`);
    }

    // Layer 4: goal memory context
    const goalMemorySection = this.buildGoalMemorySection(goalMemory);
    const sceneInstructions = this.buildSceneInstructions(conversationKind, currentJob);

    // Layer 2 cross-session: summaries from recent conversations of the same kind
    const crossSessionContext = await this.buildCrossSessionContext(
      userId,
      conversationKind,
      conversationId,
    );

    const info = profile?.basicInfo as Record<string, unknown> | undefined;
    let systemPrompt = nunjucks.renderString(QUINN_SYSTEM_PROMPT_TEMPLATE, {
      basePrompt: this.promptProvider.systemPrompt,
      sceneInstructions,
      currentJob: this.renderCurrentJobContext(currentJob),
      goalMemory: goalMemorySection,
      crossSessionContext,
      profile: info
        ? { fullName: info['fullName'] ?? 'Unknown', email: info['email'] ?? 'Unknown' }
        : null,
      materials: materials.slice(0, MAX_MATERIALS).map((m) => ({
        shiningText: m.shiningText ?? '(no shining text)',
        tags: (m.tags ?? []).join(', '),
      })),
      summaries: orderedSummaries.map((s) => s.content),
    });

    // Append density instruction — effectiveDensity is set by set_conversation_density tool
    // and defaults to BALANCED (which is already described in the base Quinn prompt).
    // TODO: pass IamSettings.density as globalDensity once IamSettings is accessible here.
    const density = resolveDensity(conversation?.effectiveDensity, null);
    systemPrompt += densityInstruction(density);

    return { systemPrompt, messages };
  }

  async findMessagesToCompress(conversationId: string): Promise<CompressableMessages> {
    const count = await this.messageRepo.count({
      where: { conversationId: conversationId, archived: false },
    });
    if (count < ROLLING_MESSAGES_WINDOW) {
      return { messages: [] };
    }

    // Briefs carry real content — the summarizer consumes them verbatim via
    // buildForCompress. Turns that fail to decrypt are dropped by the repo.
    const turns = await this.convMessages.findDecryptedTurns(conversationId);
    if (turns.length < ROLLING_MESSAGES_WINDOW) {
      return { messages: [] };
    }

    const start_message_id = turns[0]!.id;
    const end_message_id = turns[turns.length - 1]!.id;
    const messages: string[] = [];

    const tokens = turns.reduce((sum, turn) => {
      const brief = this.turnBrief(turn);
      if (brief) {
        messages.push(brief);
      }
      return (
        sum +
        this.estimateStringTokens(turn.text) +
        this.estimateStringTokens(turn.thinkingText) +
        turn.calls.reduce((v, c) => v + this.estimateStringTokens(c.resultText), 0)
      );
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

  private async loadCurrentJobContext(
    userId: string,
    anchorId: string | null,
  ): Promise<CurrentJobContext | null> {
    if (!anchorId) return null;
    const radarItem = await this.radarItemRepo.findOne({ where: { id: anchorId, userId } });
    if (!radarItem) return null;

    const jd = radarItem.parsedJdId
      ? await this.parsedJdRepo.findOne({ where: { id: radarItem.parsedJdId } })
      : null;
    const match = radarItem.parsedJdId
      ? await this.matchRepo.findOne({ where: { parsedJdId: radarItem.parsedJdId, userId } })
      : null;
    const companyBrief = jd?.company
      ? await this.companyBriefRepo.findOne({ where: { company: jd.company } })
      : null;

    return {
      radarItemId: radarItem.id,
      status: radarItem.status,
      title: jd?.title ?? null,
      company: jd?.company ?? null,
      location: jd?.location ?? null,
      hardSkills: jd?.hardSkills ?? [],
      niceToHave: jd?.niceToHave ?? [],
      match: match
        ? {
            surfaceScore: match.surfaceScore,
            deepScore: match.deepScore,
            advice: match.overallAdvice,
            rationale: match.adviceRationale,
            gaps: (match.gaps ?? []).filter((v): v is string => typeof v === 'string'),
            hits: [...(match.hitsSurface ?? []), ...(match.hitsDeep ?? [])].filter(
              (v): v is string => typeof v === 'string',
            ),
          }
        : null,
      companyBrief: companyBrief
        ? {
            whatTheyDo: companyBrief.whatTheyDo,
            sizeStage: companyBrief.sizeStage,
            recentNews: (companyBrief.recentNews ?? []).filter(
              (v): v is string => typeof v === 'string',
            ),
          }
        : null,
    };
  }

  private buildSceneInstructions(
    conversationKind: string,
    currentJob: CurrentJobContext | null,
  ): string {
    if (conversationKind === 'JOB_ANALYSIS') {
      return [
        '## Current task: job analysis',
        'Use the current job context as the primary source of truth for this conversation.',
        'Separate known facts from assumptions. If match or company data is missing, say so and use the relevant tool before making a confident claim.',
        'Give a clear APPLY, CAUTIOUS, or SKIP recommendation when the user asks whether to apply, with the 2–3 reasons that drove it.',
        'End analysis with one concrete next action: apply, skip, research a gap, tailor the resume, or answer one focused question.',
        currentJob
          ? ''
          : 'The conversation has no linked job yet; ask the user to select or link a job before analyzing it.',
      ]
        .filter(Boolean)
        .join('\n');
    }
    if (conversationKind === 'ONBOARDING') {
      return '## Current task: onboarding\nBuild the profile through one focused question at a time. Capture concrete outcomes and evidence, not generic traits.';
    }
    if (conversationKind === 'GAP_MINING' || conversationKind === 'TAILOR_EDIT') {
      return '## Current task: resume tailoring\nOnly use confirmed user material. Identify the smallest useful next edit or gap to resolve, and never invent evidence.';
    }
    if (conversationKind === 'FOLLOWUP') {
      return '## Current task: follow-up\nHelp classify the message or prepare a draft the user can review and send themselves. Make the next action explicit.';
    }
    return '';
  }

  private renderCurrentJobContext(job: CurrentJobContext | null): string {
    if (!job) return '';
    const lines = [
      `Radar item: ${job.radarItemId} (${job.status})`,
      `Role: ${job.title ?? 'Unknown'} at ${job.company ?? 'Unknown'}`,
      job.location ? `Location: ${job.location}` : '',
      job.hardSkills.length ? `Required skills: ${job.hardSkills.join(', ')}` : '',
      job.niceToHave.length ? `Nice to have: ${job.niceToHave.join(', ')}` : '',
    ].filter(Boolean);
    if (job.match) {
      lines.push(
        `Match: surface=${job.match.surfaceScore ?? 'unknown'}%, deep=${job.match.deepScore ?? 'unknown'}%, advice=${job.match.advice ?? 'unknown'}`,
        job.match.rationale ? `Match rationale: ${job.match.rationale}` : '',
        job.match.gaps.length ? `Known gaps: ${job.match.gaps.join(', ')}` : '',
        job.match.hits.length ? `Evidence hits: ${job.match.hits.join(', ')}` : '',
      );
    }
    if (job.companyBrief) {
      lines.push(
        job.companyBrief.whatTheyDo ? `Company: ${job.companyBrief.whatTheyDo}` : '',
        job.companyBrief.sizeStage ? `Company size/stage: ${job.companyBrief.sizeStage}` : '',
        job.companyBrief.recentNews.length
          ? `Recent company signals: ${job.companyBrief.recentNews.join('; ')}`
          : '',
      );
    }
    return lines.filter(Boolean).join('\n');
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

  private turnBrief(turn: DecryptedTurn): string {
    if (turn.role === 'USER') {
      return `User: ${turn.text}`;
    }
    const toolParts = turn.calls.flatMap((c) => [
      `[Call tool: ${c.toolName}]`,
      `[Tool Result for ${c.toolName}: ${c.resultText}]`,
    ]);
    return `Quinn: ${[turn.text, ...toolParts].filter(Boolean).join('\n')}`;
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
