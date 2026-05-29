import { Injectable, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { type Context } from '@earendil-works/pi-ai';
import { ConvMessage } from '../database/entities/conversation/message.entity.js';
import { ConvConversation } from '../database/entities/conversation/conversation.entity.js';
import { ProfileProfile } from '../database/entities/profile/profile.entity.js';
import { ProfileMaterial } from '../database/entities/profile/material.entity.js';
import { FIELD_CRYPTO, type FieldCrypto } from '../common/crypto/crypto.interface.js';
import { resolveDensity, densityInstruction } from '../common/density-resolver.js';

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

const MAX_HISTORY_MESSAGES = 30;

@Injectable()
export class ContextBuilderService {
  constructor(
    @InjectRepository(ConvMessage)
    private readonly messageRepo: Repository<ConvMessage>,
    @InjectRepository(ConvConversation)
    private readonly convRepo: Repository<ConvConversation>,
    @InjectRepository(ProfileProfile)
    private readonly profileRepo: Repository<ProfileProfile>,
    @InjectRepository(ProfileMaterial)
    private readonly materialRepo: Repository<ProfileMaterial>,
    @Inject(FIELD_CRYPTO) private readonly crypto: FieldCrypto,
  ) {}

  async build(
    conversationId: string,
    userId: string,
    conversationKind: string,
    anchorId?: string | null,
  ): Promise<Context> {
    const [profile, materials, history, conversation] = await Promise.all([
      this.profileRepo.findOne({ where: { userId } }),
      this.materialRepo.find({
        where: { userId, status: 'CONFIRMED' },
        take: 20,
        order: { createdAt: 'DESC' },
      }),
      this.messageRepo.find({
        where: { conversationId },
        order: { createdAt: 'ASC' },
        take: MAX_HISTORY_MESSAGES,
      }),
      this.convRepo.findOne({ where: { id: conversationId } }),
    ]);

    let systemPrompt = QUINN_SYSTEM_PROMPT;

    if (profile?.basicInfo) {
      const info = profile.basicInfo as Record<string, unknown>;
      systemPrompt += `\n\n# User profile\nName: ${info['fullName'] ?? 'Unknown'}\nEmail: ${info['email'] ?? 'Unknown'}`;
    }

    if (materials.length > 0) {
      const materialLines = materials
        .slice(0, 10)
        .map((m) => `- ${m.shiningText ?? '(no shining text)'} [${(m.tags ?? []).join(', ')}]`);
      systemPrompt += `\n\n# User's confirmed shining points (material library)\n${materialLines.join('\n')}`;
    }

    if (conversation?.rollingSummary) {
      systemPrompt += `\n\n# Conversation summary so far\n${conversation.rollingSummary}`;
    }

    // Append density instruction — effectiveDensity is set by set_conversation_density tool
    // and defaults to BALANCED (which is already described in the base Quinn prompt).
    // TODO: pass IamSettings.density as globalDensity once IamSettings is accessible here.
    const density = resolveDensity(conversation?.effectiveDensity, null);
    systemPrompt += densityInstruction(density);

    // Reconstruct history from DB records. AssistantMessage.content must be ContentBlock[]
    // (pi-ai calls .flatMap on it). Provide stub metadata so transform-messages treats these
    // as cross-model history (isSameModel=false) and only passes through text content.
    const messages: Context['messages'] = history.map((msg) =>
      msg.role === 'USER'
        ? { role: 'user' as const, content: msg.text ?? '', timestamp: msg.createdAt.getTime() }
        : {
            role: 'assistant' as const,
            content: [{ type: 'text' as const, text: msg.text ?? '' }],
            api: 'openai-completions' as const,
            provider: 'openai' as const,
            model: 'unknown',
            usage: {
              input: 0,
              output: 0,
              cacheRead: 0,
              cacheWrite: 0,
              totalTokens: 0,
              cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
            },
            stopReason: 'stop' as const,
            timestamp: msg.createdAt.getTime(),
          },
    );

    return { systemPrompt, messages };
  }
}
