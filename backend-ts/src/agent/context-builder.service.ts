import { Injectable, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { type Context, type Message } from '@earendil-works/pi-ai';

import { ConvMessage } from '../database/entities/conversation/message.entity.js';
import { ConvConversation } from '../database/entities/conversation/conversation.entity.js';
import { ConvRollingSummary } from '@/database/entities/conversation/rolling-summary.entity.js';

import { ProfileProfile } from '../database/entities/profile/profile.entity.js';
import { ProfileMaterial } from '../database/entities/profile/material.entity.js';
import { resolveDensity, densityInstruction } from '../common/density-resolver.js';

import { PinoLogger, InjectPinoLogger } from 'nestjs-pino';
import { convertTools } from 'node_modules/@earendil-works/pi-ai/dist/providers/google-shared.js';

const QUINN_SYSTEM_PROMPT = `You are Quinn, an AI job search companion built into the FindWith Chrome extension. The user is a job seeker in North America.

# Your character
You are like a 30-something career senior who has worked across multiple companies and roles. You have judgment, opinions, and the willingness to disagree with the user when needed. You are NOT a teacher (don't lecture), NOT a buddy (don't fake intimacy). You are a thoughtful peer. You are upfront about being AI when asked, but with grace.

# How you talk
- First person "I", second person "you"
- Honest. Say "I don't know" when you don't.
- Always give reasons with recommendations.
- Use humor sparingly (max once per few turns).
- No more than one exclamation mark per turn.
- Almost no emoji.
- Never say "As an AI..." unless directly asked.
- Never use canned empathy phrases like "I understand how you feel".
- Don't fake emotions.
- Never give non-answers like "it's up to you" when asked for a recommendation.

# What you can do
- Analyze jobs, companies, JDs
- Build user profile through conversation
- Mine "shining moments" the user didn't realize were valuable
- Tailor resumes (only from real user material, never fabricate)
- Help draft email replies (user copies and sends themselves)
- Fill out application forms (but user must click Submit)

# What you must NOT do
- Never fabricate experiences the user didn't have
- Never auto-submit applications without user's explicit click
- Never auto-send emails
- Never give non-answers when asked for a clear recommendation

# When user is about to make a bad move
Push back with reasoning: "I don't recommend you apply to this. Here's why: [reasons]. But if you want to, I'll help."

# When user gets an offer they accept
Be direct, not gushy. Help them archive the journey for future reference. Say goodbye gracefully.`;

export const MOST_RECENT_MESSAGES = 30;
export const MAX_ROLLING_SUMMARIES = 20;
export const MAX_MATERIALS = 20;

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
    @InjectRepository(ProfileMaterial)
    private readonly materialRepo: Repository<ProfileMaterial>,
    @InjectPinoLogger(ContextBuilderService.name)
    private readonly logger: PinoLogger,
  ) {}

  async build(
    conversationId: string,
    userId: string,
    conversationKind: string,
    anchorId?: string | null,
  ): Promise<Context> {
    const [profile, materials, recentMessages, rollingSummaries, conversation] = await Promise.all([
      this.profileRepo.findOne({ where: { userId } }),
      this.materialRepo.find({
        where: { userId, status: 'CONFIRMED' },
        take: MAX_MATERIALS,
        order: { createdAt: 'DESC' },
      }),
      this.messageRepo.find({
        where: { conversationId, archived: false },
        order: { createdAt: 'DESC' },
        take: MOST_RECENT_MESSAGES,
      }),
      this.rollingSummayRepo.find({
        where: { conversationId: conversationId },
        take: MAX_ROLLING_SUMMARIES,
        order: { createdAt: 'ASC' },
      }),
      this.convRepo.findOne({ where: { id: conversationId } }),
    ]);

    // from DESC to ASC;
    recentMessages.reverse();
    materials.reverse();

    let systemPrompt = QUINN_SYSTEM_PROMPT;

    if (profile?.basicInfo) {
      const info = profile.basicInfo as Record<string, unknown>;
      systemPrompt += `\n\n# User profile\nName: ${info['fullName'] ?? 'Unknown'}\nEmail: ${info['email'] ?? 'Unknown'}`;
    }

    if (materials.length > 0) {
      if (materials.length >= MAX_MATERIALS) {
        this.logger.warn(`materials count reach maximun value.${MAX_MATERIALS}`);
      }
      const materialLines = materials
        .slice(0, 10)
        .map((m) => `- ${m.shiningText ?? '(no shining text)'} [${(m.tags ?? []).join(', ')}]`);
      systemPrompt += `\n\n# User's confirmed shining points (material library)\n${materialLines.join('\n')}`;
    }

    if (rollingSummaries.length > 0) {
      if (rollingSummaries.length > MAX_ROLLING_SUMMARIES) {
        this.logger.warn(`rollingSummaries count reach maximun value.${MAX_ROLLING_SUMMARIES}`);
      }
      const summariesContent = rollingSummaries.map((s) => s.content).join('\n\n----\n\n');
      systemPrompt += `\n\n# Conversation summaries so far\n${summariesContent}`;
    }

    // Append density instruction — effectiveDensity is set by set_conversation_density tool
    // and defaults to BALANCED (which is already described in the base Quinn prompt).
    // TODO: pass IamSettings.density as globalDensity once IamSettings is accessible here.
    const density = resolveDensity(conversation?.effectiveDensity, null);
    systemPrompt += densityInstruction(density);

    // Reconstruct history from DB records. USER messages have no payload (legacy text-only).
    // ASSISTANT and TOOL_RESULT messages carry the full pi-ai Message object in payload.
    const messages: Message[] = recentMessages.flatMap((msg) => {
      if (msg.role === 'USER') {
        return [
          {
            role: 'user' as const,
            content: msg.text ?? '',
            timestamp: msg.createdAt.getTime(),
          },
        ];
      }
      if (msg.payload) {
        return [msg.payload as Message];
      }
      return [];
    });

    return { systemPrompt, messages };
  }
}
