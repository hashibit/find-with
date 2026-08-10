import { Injectable, Inject, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { Type } from '@sinclair/typebox';
import { JobCompanyBrief } from '../../database/entities/jobs/company-brief.entity.js';
import { LLM_PROVIDER, type LlmProvider } from '../../llm/llm-provider.interface.js';
import { type AppConfig } from '../../config/configuration.js';
import { ulid } from 'ulid';

import type { ToolExecutor } from '../tool-registry.js';
export const SEARCH_COMPANY_TOOL_NAME = 'search_company';

const BRAVE_SEARCH_URL = 'https://api.search.brave.com/res/v1/web/search';

const CompanyBriefSchema = Type.Object({
  whatTheyDo: Type.String(),
  sizeStage: Type.String(),
  recentNews: Type.Array(Type.String()),
  risks: Type.Object({
    layoffs: Type.Boolean(),
    regulatory: Type.Boolean(),
    culture: Type.Optional(Type.String()),
  }),
  glassdoorRating: Type.Union([Type.Number(), Type.Null()]),
});

@Injectable()
export class SearchCompanyTool implements ToolExecutor {
  private readonly logger = new Logger(SearchCompanyTool.name);
  private readonly braveApiKey?: string;

  constructor(
    @InjectRepository(JobCompanyBrief)
    private readonly repo: Repository<JobCompanyBrief>,
    @Inject(LLM_PROVIDER) private readonly llm: LlmProvider,
    config: ConfigService<AppConfig>,
  ) {
    this.braveApiKey = config.get('brave', { infer: true })!.apiKey;
  }

  readonly name = SEARCH_COMPANY_TOOL_NAME;
  readonly scenes = ['JOB_ANALYSIS'] as const;
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

    // Search the web for real-time company info
    let searchContext = '';
    if (this.braveApiKey) {
      try {
        const results = await this.braveSearch(company);
        if (results.length > 0) {
          searchContext = this.formatSearchResults(company, results);
        }
      } catch (err) {
        this.logger.warn(
          `Brave search failed for "${company}", falling back to LLM knowledge`,
          err,
        );
      }
    }

    const prompt = `Research the company "${company}" for a job seeker.${searchContext}`;
    const parsed = await this.llm.structuredComplete(
      {
        systemPrompt:
          'You are a company research assistant. Use search results when provided to give accurate, up-to-date information.',
        messages: [{ role: 'user', content: prompt, timestamp: Date.now() }],
      },
      CompanyBriefSchema,
    );

    const brief = cached ?? this.repo.create({ id: ulid() });
    brief.company = company;
    brief.whatTheyDo = parsed.whatTheyDo ?? null;
    brief.sizeStage = parsed.sizeStage ?? null;
    brief.recentNews = parsed.recentNews ?? null;
    brief.risks = parsed.risks as Record<string, unknown>;
    brief.glassdoorRating = parsed.glassdoorRating ?? null;
    brief.ttlExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await this.repo.save(brief);
    return this.buildResult(brief);
  }

  private formatSearchResults(
    company: string,
    results: Array<{ title: string; description: string; url: string }>,
  ): string {
    const lines = results.map((r, i) => `${i + 1}. ${r.title}\n   ${r.description}\n   ${r.url}`);
    return `\n\nSearch results about ${company}:\n${lines.join('\n')}`;
  }

  // TODO naive company search, acturally it's a company research task...
  private async braveSearch(
    company: string,
  ): Promise<Array<{ title: string; description: string; url: string }>> {
    const params = new URLSearchParams({
      q: `${company} company news layoffs funding`,
      count: '5',
      search_lang: 'en',
    });

    const resp = await fetch(`${BRAVE_SEARCH_URL}?${params}`, {
      headers: {
        Accept: 'application/json',
        'Accept-Encoding': 'gzip',
        'X-Subscription-Token': this.braveApiKey!,
      },
    });

    if (!resp.ok) {
      throw new Error(`Brave API returned ${resp.status}`);
    }

    const data = (await resp.json()) as {
      web?: { results?: Array<{ title: string; description: string; url: string }> };
    };
    return data.web?.results ?? [];
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
