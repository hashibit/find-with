import { Injectable, Logger, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'crypto';
import { Type } from '@sinclair/typebox';
import { RecoRecommendation } from '../../database/entities/recommendation/recommendation.entity.js';
import { ProfileMaterial } from '../../database/entities/profile/material.entity.js';
import { LLM_PROVIDER, type LlmProvider } from '../../llm/llm-provider.interface.js';
import { PROMPTS } from '../../agent/prompt-registry.js';
import { type AppConfig } from '../../config/configuration.js';
import { ulid } from 'ulid';

interface RecoItem {
  id: string;
  title: string;
  company: string;
  location: string;
  url: string;
  snippet: string;
  source: string;
}

@Injectable()
export class RecommendationService {
  private readonly logger = new Logger(RecommendationService.name);
  private readonly hmacSecret: string;

  constructor(
    @InjectRepository(RecoRecommendation)
    private readonly recoRepo: Repository<RecoRecommendation>,
    @InjectRepository(ProfileMaterial)
    private readonly materialRepo: Repository<ProfileMaterial>,
    @Inject(LLM_PROVIDER) private readonly llm: LlmProvider,
    private readonly config: ConfigService<AppConfig>,
  ) {
    // Re-use the crypto KEK as the HMAC secret (already required at startup)
    this.hmacSecret = this.config.get('crypto', { infer: true })!.kek;
  }

  /**
   * Build and persist today's recommendations for a user.
   * Uses SerpAPI (google_jobs engine) if SERPAPI_KEY is set, otherwise stubs.
   */
  async buildDailyRecommendations(
    userId: string,
    searchQuery: string,
  ): Promise<RecoRecommendation> {
    const jobs = await this.fetchJobs(searchQuery);

    // Rank with LLM if we have materials
    const materials = await this.materialRepo.find({
      where: { userId, status: 'CONFIRMED' },
      take: 10,
    });

    const rankedJobs = await this.rankJobs(jobs, materials, searchQuery);

    const rec = this.recoRepo.create({
      id: ulid(),
      userId,
      items: rankedJobs,
      sentAt: null,
    });

    return this.recoRepo.save(rec);
  }

  async listRecommendations(userId: string): Promise<RecoRecommendation[]> {
    return this.recoRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: 10,
    });
  }

  async recordClick(userId: string, recoId: string): Promise<void> {
    await this.recordFeedback(userId, recoId, { clickedAt: new Date().toISOString() });
  }

  async recordFeedback(
    userId: string,
    recoId: string,
    feedback: Record<string, unknown>,
  ): Promise<void> {
    const rec = await this.recoRepo.findOne({ where: { id: recoId, userId } });
    if (rec) {
      rec.feedback = { ...(rec.feedback ?? {}), ...feedback };
      await this.recoRepo.save(rec);
    }
  }

  /**
   * Generate a tracking URL for a recommendation click.
   * The trackingId is HMAC(secret, userId+recoId+dayBucket) to prevent forgery.
   */
  buildTrackingId(userId: string, recoId: string, itemIndex: number): string {
    const day = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    return createHmac('sha256', this.hmacSecret)
      .update(`${userId}:${recoId}:${itemIndex}:${day}`)
      .digest('hex')
      .slice(0, 32); // 128-bit prefix is sufficient
  }

  verifyTrackingId(userId: string, recoId: string, itemIndex: number, trackingId: string): boolean {
    const expected = this.buildTrackingId(userId, recoId, itemIndex);
    // Constant-time compare
    if (expected.length !== trackingId.length) return false;
    let diff = 0;
    for (let i = 0; i < expected.length; i++) {
      diff |= expected.charCodeAt(i) ^ trackingId.charCodeAt(i);
    }
    return diff === 0;
  }

  private async fetchJobs(query: string): Promise<RecoItem[]> {
    const serpApiKey = process.env['SERPAPI_KEY'];

    if (serpApiKey) {
      try {
        const url = new URL('https://serpapi.com/search');
        url.searchParams.set('engine', 'google_jobs');
        url.searchParams.set('q', query);
        url.searchParams.set('hl', 'en');
        url.searchParams.set('api_key', serpApiKey);

        const res = await fetch(url.toString());
        if (!res.ok) throw new Error(`SerpAPI error: ${res.status}`);

        const data = (await res.json()) as {
          jobs_results?: Array<{
            job_id: string;
            title: string;
            company_name: string;
            location: string;
            via: string;
            description: string;
            related_links?: Array<{ link: string }>;
          }>;
        };

        return (data.jobs_results ?? []).slice(0, 10).map((j) => ({
          id: j.job_id,
          title: j.title,
          company: j.company_name,
          location: j.location,
          url: j.related_links?.[0]?.link ?? '',
          snippet: j.description?.slice(0, 300) ?? '',
          source: 'serpapi',
        }));
      } catch (err) {
        this.logger.warn(`SerpAPI fetch failed, using stub: ${String(err)}`);
      }
    }

    // Stub for development / no API key
    return [
      {
        id: 'stub-1',
        title: 'Software Engineer',
        company: 'Example Corp',
        location: 'Remote',
        url: 'https://www.linkedin.com/jobs',
        snippet: 'A great opportunity matching your profile.',
        source: 'stub',
      },
    ];
  }

  private async rankJobs(
    jobs: RecoItem[],
    materials: ProfileMaterial[],
    query: string,
  ): Promise<RecoItem[]> {
    if (jobs.length === 0 || materials.length === 0) return jobs;

    const profileSummary = materials
      .map((m) => m.shiningText ?? '')
      .filter(Boolean)
      .join('; ');

    const prompt = `${PROMPTS.rank_recommendations_v1}

Search query: "${query}"
Profile highlights: ${profileSummary}

Jobs to rank:
${jobs.map((j, i) => `${i}. [${j.id}] ${j.title} at ${j.company} (${j.location}): ${j.snippet}`).join('\n')}

Return the top ranked job IDs.`;

    try {
      const RankedJobsSchema = Type.Object({
        ranked: Type.Array(Type.Object({ jobId: Type.String() })),
      });

      const parsed = await this.llm.structuredComplete(
        {
          systemPrompt: 'You are a job recommendation ranker.',
          messages: [{ role: 'user', content: prompt, timestamp: Date.now() }],
        },
        RankedJobsSchema,
      );

      const rankedIds = (parsed.ranked ?? []).map((r) => r.jobId);
      const rankedJobs = rankedIds
        .map((id) => jobs.find((j) => j.id === id))
        .filter((j): j is RecoItem => j !== undefined);

      // Append any unranked jobs at the end
      const unranked = jobs.filter((j) => !rankedIds.includes(j.id));
      return [...rankedJobs, ...unranked];
    } catch {
      return jobs;
    }
  }
}
