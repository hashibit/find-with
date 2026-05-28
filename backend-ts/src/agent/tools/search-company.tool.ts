import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Type } from '@sinclair/typebox';
import { JobCompanyBrief } from '../../database/entities/jobs/company-brief.entity.js';
import { LlmService } from '../../llm/llm.service.js';
import { ulid } from 'ulid';

export const SEARCH_COMPANY_TOOL_NAME = 'search_company';

@Injectable()
export class SearchCompanyTool {
  constructor(
    @InjectRepository(JobCompanyBrief)
    private readonly repo: Repository<JobCompanyBrief>,
    private readonly llm: LlmService,
  ) {}

  readonly name = SEARCH_COMPANY_TOOL_NAME;
  readonly description =
    'Search for company information including size, stage, recent news, and risk signals.';
  readonly parameters = Type.Object({
    company: Type.String({ description: 'Company name to research' }),
  });

  async execute(
    _toolCallId: string,
    params: { company: string },
  ): Promise<{ content: Array<{ type: 'text'; text: string }>; details: Record<string, unknown> }> {
    const { company } = params;

    // Check cache (TTL-aware)
    const cached = await this.repo.findOne({ where: { company } });
    if (cached && cached.ttlExpires && cached.ttlExpires > new Date()) {
      return this.buildResult(cached);
    }

    // Ask LLM for company research
    const prompt = `Research the company "${company}" for a job seeker. Provide:
1. What they do (1-2 sentences)
2. Size and stage (startup/scaleup/enterprise, employee count if known)
3. Recent news (last 6 months: funding, layoffs, acquisitions, product launches)
4. Risk signals (mass layoffs, regulatory issues, leadership turnover, negative reviews)
5. Glassdoor rating estimate (if known)

Respond as JSON with keys: whatTheyDo, sizeStage, recentNews (array), risks (object with: layoffs, regulatory, culture), glassdoorRating (number or null)`;

    const raw = await this.llm.completeContext({
      systemPrompt: 'You are a company research assistant. Respond only with valid JSON.',
      messages: [{ role: 'user', content: prompt }],
    });

    let parsed: Record<string, unknown> = {};
    try {
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (jsonMatch) parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
    } catch {
      parsed = { whatTheyDo: raw };
    }

    const brief = cached ?? this.repo.create({ id: ulid() });
    brief.company = company;
    brief.whatTheyDo = (parsed['whatTheyDo'] as string) ?? null;
    brief.sizeStage = (parsed['sizeStage'] as string) ?? null;
    brief.recentNews = (parsed['recentNews'] as unknown[]) ?? null;
    brief.risks = (parsed['risks'] as Record<string, unknown>) ?? null;
    brief.glassdoorRating = (parsed['glassdoorRating'] as number) ?? null;
    brief.ttlExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 day TTL

    await this.repo.save(brief);
    return this.buildResult(brief);
  }

  private buildResult(brief: JobCompanyBrief): {
    content: Array<{ type: 'text'; text: string }>;
    details: Record<string, unknown>;
  } {
    const text = [
      `**${brief.company}**`,
      brief.whatTheyDo ?? 'No description available.',
      brief.sizeStage ? `Size/Stage: ${brief.sizeStage}` : '',
      brief.glassdoorRating ? `Glassdoor: ${brief.glassdoorRating}/5` : '',
      brief.recentNews?.length ? `Recent news: ${(brief.recentNews as string[]).join(', ')}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    return {
      content: [{ type: 'text', text }],
      details: {
        companyBriefId: brief.id,
        company: brief.company,
        sizeStage: brief.sizeStage,
        glassdoorRating: brief.glassdoorRating,
        risks: brief.risks,
      },
    };
  }
}
