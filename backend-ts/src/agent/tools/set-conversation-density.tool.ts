import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Type, Static } from '@sinclair/typebox';
import { ConvConversation } from '../../database/entities/conversation/conversation.entity.js';

export const SET_CONVERSATION_DENSITY_TOOL_NAME = 'set_conversation_density';

const DensityEnum = Type.Union([
  Type.Literal('ENGAGED'),
  Type.Literal('BALANCED'),
  Type.Literal('QUIET'),
]);

@Injectable()
export class SetConversationDensityTool {
  constructor(
    @InjectRepository(ConvConversation)
    private readonly repo: Repository<ConvConversation>,
  ) {}

  readonly name = SET_CONVERSATION_DENSITY_TOOL_NAME;
  readonly description =
    'Temporarily change conversation density when user expresses preference.';
  readonly parameters = Type.Object({
    density: DensityEnum,
    reason: Type.String(),
  });

  async execute(
    _toolCallId: string,
    params: { density: Static<typeof DensityEnum>; reason: string },
    context: { conversationId: string },
  ): Promise<{ content: Array<{ type: 'text'; text: string }>; details: Record<string, unknown> }> {
    await this.repo.update({ id: context.conversationId }, { effectiveDensity: params.density });

    const messages: Record<string, string> = {
      ENGAGED: "Got it. I'll be more proactive from here.",
      BALANCED: "Understood. Back to standard mode.",
      QUIET: "Sure. I'll keep it minimal.",
    };

    return {
      content: [{ type: 'text', text: messages[params.density] ?? 'Density updated.' }],
      details: { density: params.density, conversationId: context.conversationId },
    };
  }
}
