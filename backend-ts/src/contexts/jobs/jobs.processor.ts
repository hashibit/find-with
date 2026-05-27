import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JobCapture } from '../../database/entities/jobs/job-capture.entity';
import { JobParsedJd } from '../../database/entities/jobs/parsed-jd.entity';
import { JobCompanyBrief } from '../../database/entities/jobs/company-brief.entity';
import { JobMatchResult } from '../../database/entities/jobs/match-result.entity';
import { JobRadarItem } from '../../database/entities/jobs/radar-item.entity';
import { ProfileMaterial } from '../../database/entities/profile/material.entity';
import { LlmService, MODEL_PARSE } from '../../llm/llm.service';
import { JOB_ANALYZE_QUEUE } from './jobs.service';
import { ulid } from 'ulid';

@Processor(JOB_ANALYZE_QUEUE)
export class JobsProcessor extends WorkerHost {
  private readonly logger = new Logger(JobsProcessor.name);

  constructor(
    @InjectRepository(JobCapture) private readonly captureRepo: Repository<JobCapture>,
    @InjectRepository(JobParsedJd) private readonly jdRepo: Repository<JobParsedJd>,
    @InjectRepository(JobCompanyBrief) private readonly companyRepo: Repository<JobCompanyBrief>,
    @InjectRepository(JobMatchResult) private readonly matchRepo: Repository<JobMatchResult>,
    @InjectRepository(JobRadarItem) private readonly radarRepo: Repository<JobRadarItem>,
    @InjectRepository(ProfileMaterial) private readonly materialRepo: Repository<ProfileMaterial>,
    private readonly llm: LlmService,
  ) {
    super();
  }

  async process(job: Job<{ captureId: string; userId: string }>): Promise<void> {
    const { captureId, userId } = job.data;
    const capture = await this.captureRepo.findOne({ where: { id: captureId } });
    if (!capture) return;

    const text = capture.capturedText ?? '';

    // 1. Parse JD
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

    const jdRaw = await this.llm.complete(MODEL_PARSE, [
      { role: 'system', content: 'Parse job descriptions into structured JSON. Output only JSON.' },
      { role: 'user', content: jdPrompt },
    ]);

    let jdParsed: Record<string, unknown> = {};
    try {
      const m = jdRaw.match(/\{[\s\S]*\}/);
      if (m) jdParsed = JSON.parse(m[0]) as Record<string, unknown>;
    } catch {
      this.logger.warn('JD parse failed, using empty object');
    }

    const parsedJd = this.jdRepo.create({
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

    // 2. Company research (with TTL cache)
    const company = parsedJd.company;
    if (company) {
      const existing = await this.companyRepo.findOne({ where: { company } });
      if (!existing || !existing.ttlExpires || existing.ttlExpires < new Date()) {
        const companyPrompt = `Research "${company}". Return JSON: { "whatTheyDo": string, "sizeStage": string, "recentNews": [string], "risks": { "layoffs": boolean, "regulatory": boolean }, "glassdoorRating": number|null }`;
        const companyRaw = await this.llm.complete(MODEL_PARSE, [
          { role: 'system', content: 'You research companies. Return only JSON.' },
          { role: 'user', content: companyPrompt },
        ]);
        let companyData: Record<string, unknown> = {};
        try {
          const m = companyRaw.match(/\{[\s\S]*\}/);
          if (m) companyData = JSON.parse(m[0]) as Record<string, unknown>;
        } catch { /* ignore */ }

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

    // 3. Compute match scores (keyword-based surface + material-based deep)
    const materials = await this.materialRepo.find({ where: { userId, status: 'CONFIRMED' } });
    const hardSkills = (jdParsed['hardSkills'] as string[]) ?? [];

    const materialTexts = materials.map((m) => (m.shiningText ?? '') + ' ' + (m.tags ?? []).join(' ')).join(' ').toLowerCase();

    const surfaceHits = hardSkills.filter((s) => text.toLowerCase().includes(s.toLowerCase()));
    const deepHits = hardSkills.filter((s) => materialTexts.includes(s.toLowerCase()));

    const surfaceScore = hardSkills.length > 0 ? (surfaceHits.length / hardSkills.length) * 100 : 0;
    const deepScore = hardSkills.length > 0 ? (Math.max(surfaceHits.length, deepHits.length) / hardSkills.length) * 100 : 0;
    const gaps = hardSkills.filter((s) => !deepHits.includes(s) && !surfaceHits.includes(s));

    const overallAdvice = surfaceScore >= 70 ? 'APPLY' : surfaceScore >= 40 ? 'CAUTIOUS' : 'SKIP';

    const matchResult = this.matchRepo.create({
      id: ulid(),
      parsedJdId: parsedJd.id,
      userId,
      surfaceScore: Math.round(surfaceScore),
      deepScore: Math.round(deepScore),
      gaps: gaps.slice(0, 10),
      hitsSurface: surfaceHits,
      hitsDeep: deepHits,
      overallAdvice,
      adviceRationale: `${surfaceHits.length}/${hardSkills.length} hard skills matched on resume`,
    });
    await this.matchRepo.save(matchResult);

    // 4. Update radar status to ANALYZED
    await this.radarRepo.update({ captureId }, { status: 'ANALYZED', parsedJdId: parsedJd.id, matchId: matchResult.id, lastStatusAt: new Date() });

    this.logger.log(`Job analyzed: ${parsedJd.title} @ ${parsedJd.company} (surface=${surfaceScore.toFixed(0)}%)`);
  }
}
