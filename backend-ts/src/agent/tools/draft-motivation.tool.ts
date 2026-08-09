import { Injectable, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Type } from '@sinclair/typebox';
import { JobParsedJd } from '../../database/entities/jobs/parsed-jd.entity.js';
import { LLM_PROVIDER, type LlmProvider } from '../../llm/llm-provider.interface.js';

import type { ToolExecutor } from '../tool-registry.js';
export const DRAFT_MOTIVATION_TOOL_NAME = 'draft_motivation';

@Injectable()
export class DraftMotivationTool implements ToolExecutor {
  constructor(
    @InjectRepository(JobParsedJd)
    private readonly jdRepo: Repository<JobParsedJd>,
    @Inject(LLM_PROVIDER) private readonly llm: LlmProvider,
  ) {}

  readonly name = DRAFT_MOTIVATION_TOOL_NAME;
  readonly scenes = ['TAILOR_EDIT'] as const;
  readonly description = "Draft a 'Why are you interested?' response for a job application form.";
  readonly parameters = Type.Object({
    parsed_jd_id: Type.String(),
    profile_summary: Type.Optional(Type.String()),
  });

  async execute(
    _toolCallId: string,
    params: { parsed_jd_id: string; profile_summary?: string },
  ): Promise<{ content: Array<{ type: 'text'; text: string }>; details: Record<string, unknown> }> {
    const jd = await this.jdRepo.findOne({ where: { id: params.parsed_jd_id } });
    if (!jd) {
      return {
        content: [{ type: 'text', text: 'Could not find the parsed JD. Please try again.' }],
        details: {},
      };
    }

    const context = [
      `Role: ${jd.title ?? 'Unknown'} at ${jd.company ?? 'Unknown'}`,
      `Key requirements: ${(jd.hardSkills ?? []).slice(0, 5).join(', ')}`,
      params.profile_summary ? `Candidate background: ${params.profile_summary}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    const draft = await this.llm.completeContext({
      systemPrompt:
        'You write concise, authentic "Why are you interested?" responses for job applications. 2-3 sentences max. No clichés. Specific to the role.',
      messages: [
        {
          role: 'user',
          content: `Write a motivation statement for this application:\n${context}`,
          timestamp: Date.now(),
        },
      ],
    });

    return {
      content: [
        { type: 'text', text: `Here's a draft motivation statement:\n\n"${draft.trim()}"` },
      ],
      details: { draft: draft.trim(), parsedJdId: params.parsed_jd_id },
    };
  }
}
