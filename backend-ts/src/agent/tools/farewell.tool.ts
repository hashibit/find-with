import { Injectable, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Type } from '@sinclair/typebox';
import { JobRadarItem } from '../../database/entities/jobs/radar-item.entity.js';
import { ProfileMaterial } from '../../database/entities/profile/material.entity.js';
import { LLM_PROVIDER, type LlmProvider } from '../../llm/llm-provider.interface.js';
import { PROMPTS } from '../prompt-registry.js';

export const FAREWELL_TOOL_NAME = 'farewell_recap';

@Injectable()
export class FarewellTool {
  constructor(
    @InjectRepository(JobRadarItem)
    private readonly radarRepo: Repository<JobRadarItem>,
    @InjectRepository(ProfileMaterial)
    private readonly materialRepo: Repository<ProfileMaterial>,
    @Inject(LLM_PROVIDER) private readonly llm: LlmProvider,
  ) {}

  readonly name = FAREWELL_TOOL_NAME;
  readonly description =
    "Generate a farewell message and job search recap when the user accepts an offer. Call when status transitions to OFFER_ACCEPTED.";
  readonly parameters = Type.Object({
    radar_item_id: Type.String({ description: 'The radar item ID of the accepted offer' }),
  });

  async execute(
    _toolCallId: string,
    params: { radar_item_id: string },
    context: { userId: string; conversationId: string },
  ): Promise<{ content: Array<{ type: 'text'; text: string }>; details: Record<string, unknown> }> {
    const { userId } = context;

    // Gather stats
    const allItems = await this.radarRepo.find({ where: { userId } });
    const applied = allItems.filter((i) => i.status === 'APPLIED').length;
    const interviewed = allItems.filter((i) => i.status === 'INTERVIEWING').length;
    const offers = allItems.filter((i) =>
      ['OFFER_RECEIVED', 'OFFER_ACCEPTED'].includes(i.status),
    ).length;

    const materials = await this.materialRepo.find({
      where: { userId, status: 'CONFIRMED' },
      order: { createdAt: 'ASC' },
    });

    const topMaterials = materials.slice(0, 5).map((m) => m.shiningText ?? '').filter(Boolean);

    const prompt = `${PROMPTS.farewell_recap_v1}

User's job search stats:
- Total applications: ${applied}
- Interviews: ${interviewed}
- Offers received: ${offers}
- Materials/shining points discovered: ${materials.length}
- Top highlights: ${topMaterials.join('; ')}

Generate a warm farewell and structured recap.`;

    let farewell = '';
    let recap = '';

    try {
      const raw = await this.llm.completeContext({
        systemPrompt: 'You are Quinn, an AI job search companion. Respond only with valid JSON.',
        messages: [{ role: 'user', content: prompt, timestamp: Date.now() }],
      });
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as { farewellMessage?: string; recapMarkdown?: string };
        farewell = parsed.farewellMessage ?? '';
        recap = parsed.recapMarkdown ?? '';
      }
    } catch {
      farewell = `Congratulations. This one was real work. Your profile now has ${materials.length} documented shining points — they'll still be here the next time you need them. Good luck with the new role.`;
      recap = `# Job Search Recap\n\n**Applications:** ${applied}\n**Interviews:** ${interviewed}\n**Offers:** ${offers}\n\n**Top highlights discovered:**\n${topMaterials.map((m) => `- ${m}`).join('\n')}`;
    }

    // Mark the accepted radar item
    await this.radarRepo.update({ id: params.radar_item_id }, { status: 'OFFER_ACCEPTED' });

    return {
      content: [{ type: 'text', text: `${farewell}\n\n---\n\n${recap}` }],
      details: { farewellMessage: farewell, recapMarkdown: recap, stats: { applied, interviewed, offers } },
    };
  }
}
