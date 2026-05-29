import { Injectable, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Type } from '@sinclair/typebox';
import { ProfileMaterial } from '../../database/entities/profile/material.entity.js';
import { LLM_PROVIDER, type LlmProvider } from '../../llm/llm-provider.interface.js';
import { FIELD_CRYPTO, type FieldCrypto } from '../../common/crypto/crypto.interface.js';
import { ulid } from 'ulid';

export const MINE_SHINING_POINT_TOOL_NAME = 'mine_shining_point';

@Injectable()
export class MineShiningPointTool {
  constructor(
    @InjectRepository(ProfileMaterial)
    private readonly repo: Repository<ProfileMaterial>,
    @Inject(LLM_PROVIDER) private readonly llm: LlmProvider,
    @Inject(FIELD_CRYPTO) private readonly crypto: FieldCrypto,
  ) {}

  readonly name = MINE_SHINING_POINT_TOOL_NAME;
  readonly description =
    "Extract a 'shining point' achievement from the user's message and create a PROPOSED material item.";
  readonly parameters = Type.Object({
    raw_text: Type.String({ description: "The user's original words to extract from" }),
  });

  async execute(
    _toolCallId: string,
    params: { raw_text: string },
    context: { userId: string; conversationId: string },
  ): Promise<{ content: Array<{ type: 'text'; text: string }>; details: Record<string, unknown> }> {
    const { raw_text } = params;

    const prompt = `Analyze this user statement and extract a "shining moment" for their job search profile:

"${raw_text}"

Return JSON with:
- shiningText: A polished, third-person professional bullet (strong verb + impact + context)
- rationale: Why this is a valuable highlight (1 sentence)
- tags: Array of 2-4 tags from [leadership, ownership, technical_depth, process_improvement, cross_functional, initiative, crisis_management, quantified_impact, mentoring, communication]

Example shiningText: "Redesigned onboarding process within first 60 days, reducing new-hire ramp time by 30%"`;

    const raw = await this.llm.completeContext({
      systemPrompt:
        'You are a career coach who extracts professional achievements. Respond only with valid JSON.',
      messages: [{ role: 'user', content: prompt, timestamp: Date.now() }],
    });

    let parsed: { shiningText?: string; rationale?: string; tags?: string[] } = {};
    try {
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (jsonMatch) parsed = JSON.parse(jsonMatch[0]) as typeof parsed;
    } catch {
      parsed = { shiningText: raw_text };
    }

    // Store raw text encrypted
    const encryptedRaw = await this.crypto.encrypt(raw_text);

    const material = this.repo.create({
      id: ulid(),
      userId: context.userId,
      rawText: encryptedRaw,
      shiningText: parsed.shiningText ?? raw_text,
      rationale: parsed.rationale ?? null,
      tags: parsed.tags ?? null,
      provenanceKind: 'conversation',
      provenanceData: { conversationId: context.conversationId },
      status: 'PROPOSED',
    });

    await this.repo.save(material);

    return {
      content: [
        {
          type: 'text',
          text: `Shining point captured:\n"${material.shiningText}"\n\nTags: ${(material.tags ?? []).join(', ')}\n\nThis is saved as a PROPOSED material. Once confirmed, it will be available for resume tailoring.`,
        },
      ],
      details: { materialId: material.id, shiningText: material.shiningText, tags: material.tags },
    };
  }
}
