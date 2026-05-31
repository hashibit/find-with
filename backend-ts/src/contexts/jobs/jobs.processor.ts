import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, Inject } from '@nestjs/common';
import { Job } from 'bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JobCapture } from '../../database/entities/jobs/job-capture.entity.js';
import { JobParsedJd } from '../../database/entities/jobs/parsed-jd.entity.js';
import { JobCompanyBrief } from '../../database/entities/jobs/company-brief.entity.js';
import { JobMatchResult } from '../../database/entities/jobs/match-result.entity.js';
import { JobRadarItem } from '../../database/entities/jobs/radar-item.entity.js';
import { LLM_PROVIDER, type LlmProvider } from '../../llm/llm-provider.interface.js';
import { MaterialManager } from '../profile/material-manager.service.js';
import { JOB_ANALYZE_QUEUE } from './jobs.service.js';
import { ulid } from 'ulid';

// Number of top-scoring materials to use for deep match scoring.
// Larger values pull in more context but dilute the signal from the closest matches.
const TOP_K = 8;

@Processor(JOB_ANALYZE_QUEUE)
export class JobsProcessor extends WorkerHost {
  private readonly logger = new Logger(JobsProcessor.name);

  constructor(
    @InjectRepository(JobCapture) private readonly captureRepo: Repository<JobCapture>,
    @InjectRepository(JobParsedJd) private readonly jdRepo: Repository<JobParsedJd>,
    @InjectRepository(JobCompanyBrief) private readonly companyRepo: Repository<JobCompanyBrief>,
    @InjectRepository(JobMatchResult) private readonly matchRepo: Repository<JobMatchResult>,
    @InjectRepository(JobRadarItem) private readonly radarRepo: Repository<JobRadarItem>,
    @Inject(LLM_PROVIDER) private readonly llm: LlmProvider,
    private readonly materialManager: MaterialManager,
  ) {
    super();
  }

  async process(job: Job<{ captureId: string; userId: string }>): Promise<void> {
    const { captureId, userId } = job.data;
    const capture = await this.captureRepo.findOne({ where: { id: captureId } });
    if (!capture) return;

    const text = capture.capturedText ?? '';

    // 1. Parse JD — idempotent: skip if already done for this capture
    let parsedJd = await this.jdRepo.findOne({ where: { captureId } });
    if (!parsedJd) {
      const jdPrompt = `Parse this job description into structured JSON. Return ONLY valid JSON.

JD text:
${text.slice(0, 6000)}

Return JSON:
{
  "title": string,
  "company": string,
  "location": string,
  "hardSkills": [string],
  "softSkills": [string],
  "experience": { "yearsMin": number, "yearsMax": number, "industries": [string] },
  "educationRequired": { "degree": string, "required": boolean },
  "hiddenSignals": [string],
  "niceToHave": [string],
  "buzzwordTranslation": string
}`;

      const jdRaw = await this.llm.completeContext({
        systemPrompt: 'Parse job descriptions into structured JSON. Output only JSON.',
        messages: [{ role: 'user', content: jdPrompt, timestamp: Date.now() }],
      });

      let jdParsed: Record<string, unknown> = {};
      try {
        const m = jdRaw.match(/\{[\s\S]*\}/);
        if (m) jdParsed = JSON.parse(m[0]) as Record<string, unknown>;
      } catch {
        this.logger.warn('JD parse failed, using empty object');
      }

      parsedJd = this.jdRepo.create({
        id: ulid(),
        captureId,
        title: (jdParsed['title'] as string) ?? null,
        company: (jdParsed['company'] as string) ?? null,
        location: (jdParsed['location'] as string) ?? null,
        hardSkills: (jdParsed['hardSkills'] as string[]) ?? null,
        softSkills: (jdParsed['softSkills'] as string[]) ?? null,
        experience: (jdParsed['experience'] as Record<string, unknown>) ?? null,
        educationRequired: (jdParsed['educationRequired'] as Record<string, unknown>) ?? null,
        hiddenSignals: (jdParsed['hiddenSignals'] as string[]) ?? null,
        niceToHave: (jdParsed['niceToHave'] as string[]) ?? null,
        buzzwordTranslation: (jdParsed['buzzwordTranslation'] as string) ?? null,
      });
      await this.jdRepo.save(parsedJd);
    }

    // Layer 3: embed JD text for semantic material matching (non-blocking)
    if (!parsedJd.jdEmbedding) {
      try {
        const jdEmbedText = [
          parsedJd.title,
          parsedJd.company,
          ...(parsedJd.hardSkills ?? []),
          ...(parsedJd.softSkills ?? []),
          parsedJd.buzzwordTranslation,
        ]
          .filter(Boolean)
          .join(' ');
        const jdEmbedding = await this.llm.embed(jdEmbedText);
        await this.jdRepo.update(parsedJd.id, { jdEmbedding });
        parsedJd.jdEmbedding = jdEmbedding;
      } catch {
        // embedding failure is non-blocking
      }
    }

    // 2. Company research (with TTL cache — already effectively checkpointed at DB level)
    const company = parsedJd.company;
    if (company) {
      const existing = await this.companyRepo.findOne({ where: { company } });
      if (!existing || !existing.ttlExpires || existing.ttlExpires < new Date()) {
        const companyPrompt = `Research "${company}". Return JSON: { "whatTheyDo": string, "sizeStage": string, "recentNews": [string], "risks": { "layoffs": boolean, "regulatory": boolean }, "glassdoorRating": number|null }`;
        const companyRaw = await this.llm.completeContext({
          systemPrompt: 'You research companies. Return only JSON.',
          messages: [{ role: 'user', content: companyPrompt, timestamp: Date.now() }],
        });
        let companyData: Record<string, unknown> = {};
        try {
          const m = companyRaw.match(/\{[\s\S]*\}/);
          if (m) companyData = JSON.parse(m[0]) as Record<string, unknown>;
        } catch {
          /* ignore */
        }

        const brief = existing ?? this.companyRepo.create({ id: ulid() });
        Object.assign(brief, {
          company,
          whatTheyDo: companyData['whatTheyDo'] ?? null,
          sizeStage: companyData['sizeStage'] ?? null,
          recentNews: companyData['recentNews'] ?? null,
          risks: companyData['risks'] ?? null,
          glassdoorRating: companyData['glassdoorRating'] ?? null,
          ttlExpires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        });
        await this.companyRepo.save(brief);
      }
    }

    // 3. Compute match scores — idempotent: skip if already scored for this JD
    let matchResult = await this.matchRepo.findOne({ where: { parsedJdId: parsedJd.id } });
    if (!matchResult) {
      const materials = await this.materialManager.confirmedForUser(userId);
      const hardSkills = (parsedJd.hardSkills as string[] | null) ?? [];

      // Layer 1: Surface match - pure keyword substring on JD text
      const textLower = text.toLowerCase();
      const surfaceHits = hardSkills.filter((s) => textLower.includes(s.toLowerCase()));
      const surfaceScore =
        hardSkills.length > 0 ? (surfaceHits.length / hardSkills.length) * 100 : 0;

      // Layer 2 & 3: Deep match with semantic search using embeddings
      // First, compute JD embedding if not already done (handled in Layer 3 embedding above)
      const jdEmbedding = parsedJd.jdEmbedding ?? null;

      let deepScore = 0;
      let deepHits: string[] = [];

      if (jdEmbedding && materials.some((m) => m.embedding && m.embedding.length > 0)) {
        // Score each material by its similarity to JD
        const materialScores = materials
          .filter((m) => m.embedding && m.embedding.length > 0)
          .map((m) => ({
            material: m,
            score: this.cosineSimilarity(jdEmbedding, m.embedding!),
            text: (m.shiningText ?? '') + ' ' + (m.tags ?? []).join(' '),
          }))
          .sort((a, b) => b.score - a.score);

        // Deep score: average of top-k material similarities (scaled to 0-100).
        // Cosine similarity is in [-1, 1]; clamp to 0 so negative values
        // (semantically dissimilar materials) don't produce meaningless negative scores.
        const topK = materialScores.slice(0, TOP_K);
        if (topK.length > 0) {
          const avgSimilarity = topK.reduce((sum, m) => sum + m.score, 0) / topK.length;
          deepScore = Math.max(0, Math.round(avgSimilarity * 100));
        }

        // Deep hits: skills that appear in top materials (still uses keywords for interpretability)
        const topMaterialTexts = topK.map((m) => m.text.toLowerCase()).join(' ');
        deepHits = hardSkills.filter((s) => topMaterialTexts.includes(s.toLowerCase()));
      } else {
        // Fallback: pure substring matching if no embeddings available
        const materialTexts = materials
          .map((m) => (m.shiningText ?? '') + ' ' + (m.tags ?? []).join(' '))
          .join(' ')
          .toLowerCase();
        deepHits = hardSkills.filter((s) => materialTexts.includes(s.toLowerCase()));
        deepScore =
          hardSkills.length > 0
            ? (Math.max(surfaceHits.length, deepHits.length) / hardSkills.length) * 100
            : 0;
      }

      const gaps = hardSkills.filter((s) => !deepHits.includes(s) && !surfaceHits.includes(s));
      const overallAdvice = surfaceScore >= 70 ? 'APPLY' : surfaceScore >= 40 ? 'CAUTIOUS' : 'SKIP';

      matchResult = this.matchRepo.create({
        id: ulid(),
        parsedJdId: parsedJd.id,
        userId,
        surfaceScore: Math.round(surfaceScore),
        deepScore: Math.round(deepScore),
        gaps: gaps.slice(0, 10),
        hitsSurface: surfaceHits,
        hitsDeep: deepHits,
        overallAdvice,
        adviceRationale: `${surfaceHits.length}/${hardSkills.length} hard skills matched on resume; deep=${deepHits.length} via semantic search`,
      });
      await this.matchRepo.save(matchResult);
    }

    // 4. Update radar status to ANALYZED
    await this.radarRepo.update(
      { captureId },
      {
        status: 'ANALYZED',
        parsedJdId: parsedJd.id,
        matchId: matchResult.id,
        lastStatusAt: new Date(),
      },
    );

    this.logger.log(
      `Job analyzed: ${parsedJd.title} @ ${parsedJd.company} (surface=${matchResult.surfaceScore}%)`,
    );
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    let dot = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i]! * b[i]!;
      normA += a[i]! * a[i]!;
      normB += b[i]! * b[i]!;
    }
    if (normA === 0 || normB === 0) return 0;
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
  }
}
