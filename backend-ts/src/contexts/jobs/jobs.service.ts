import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { JobCapture } from '../../database/entities/jobs/job-capture.entity.js';
import { JobParsedJd } from '../../database/entities/jobs/parsed-jd.entity.js';
import { JobCompanyBrief } from '../../database/entities/jobs/company-brief.entity.js';
import { JobMatchResult } from '../../database/entities/jobs/match-result.entity.js';
import { JobRadarItem } from '../../database/entities/jobs/radar-item.entity.js';
import { ProfileSkill } from '../../database/entities/profile/skill.entity.js';
import { ulid } from 'ulid';

const STOPWORDS = new Set([
  'and', 'the', 'for', 'with', 'you', 'our', 'are', 'this', 'that', 'will',
  'have', 'from', 'your', 'they', 'who', 'what', 'when', 'where', 'which',
  'how', 'but', 'not', 'all', 'can', 'has', 'had', 'was', 'were', 'been',
  'about', 'also', 'their', 'than', 'into', 'over', 'each', 'work', 'role',
  'team', 'across', 'strong', 'ability', 'experience', 'skills', 'years',
  'looking', 'seeking', 'join', 'help', 'build', 'using', 'help', 'drive',
]);

export const JOB_ANALYZE_QUEUE = 'JOB_ANALYZE';

export interface QuickMatchResult {
  score: number;
  matchedSkills: string[];
  missingKeywords: string[];
}

const VALID_RADAR_TRANSITIONS: Record<string, string[]> = {
  BROWSED: ['ANALYZED', 'DECIDED_NO'],
  ANALYZED: ['DECIDED', 'DECIDED_NO'],
  DECIDED: ['APPLIED'],
  APPLIED: ['INTERVIEWING', 'REJECTED'],
  INTERVIEWING: ['OFFER_RECEIVED', 'REJECTED'],
  OFFER_RECEIVED: ['OFFER_ACCEPTED', 'OFFER_REJECTED'],
};

@Injectable()
export class JobsService {
  constructor(
    @InjectRepository(JobCapture)
    private readonly captureRepo: Repository<JobCapture>,
    @InjectRepository(JobParsedJd)
    private readonly jdRepo: Repository<JobParsedJd>,
    @InjectRepository(JobCompanyBrief)
    private readonly companyRepo: Repository<JobCompanyBrief>,
    @InjectRepository(JobMatchResult)
    private readonly matchRepo: Repository<JobMatchResult>,
    @InjectRepository(JobRadarItem)
    private readonly radarRepo: Repository<JobRadarItem>,
    @InjectRepository(ProfileSkill)
    private readonly skillRepo: Repository<ProfileSkill>,
    @InjectQueue(JOB_ANALYZE_QUEUE) private readonly analyzeQueue: Queue,
  ) {}

  async captureJob(
    userId: string,
    data: {
      source: string;
      sourceUrl: string;
      sourceJobId?: string;
      capturedHtml?: string;
      capturedText?: string;
      meta?: Record<string, unknown>;
    },
  ): Promise<{ capture: JobCapture; radarItem: JobRadarItem; quickMatch: QuickMatchResult }> {
    const capture = this.captureRepo.create({ id: ulid(), userId, ...data });
    await this.captureRepo.save(capture);

    const radarItem = this.radarRepo.create({
      id: ulid(),
      userId,
      captureId: capture.id,
      status: 'BROWSED',
      lastStatusAt: new Date(),
    });
    await this.radarRepo.save(radarItem);

    // Heuristic match — no LLM, runs synchronously from the user's skills
    const quickMatch = await this.quickHeuristicMatch(data.capturedText ?? '', userId);

    return { capture, radarItem, quickMatch };
  }

  async enqueueAnalysis(userId: string, captureId: string): Promise<void> {
    const capture = await this.captureRepo.findOne({ where: { id: captureId } });
    if (!capture) throw new NotFoundException('Job not found');
    if (capture.userId !== userId) throw new ForbiddenException();
    await this.analyzeQueue.add('analyze', { captureId, userId });
  }

  private async quickHeuristicMatch(jdText: string, userId: string): Promise<QuickMatchResult> {
    const skills = await this.skillRepo.find({ where: { userId } });
    if (!skills.length) return { score: 0, matchedSkills: [], missingKeywords: [] };

    const jdLower = jdText.toLowerCase();

    // Which of the user's known skills appear verbatim in the JD?
    const matched = skills.filter((s) => jdLower.includes(s.name.toLowerCase()));

    // Extract capitalised "tech-looking" tokens from JD as candidate keywords
    const jdKeywords = [
      ...new Set(
        (jdText.match(/\b[A-Z][a-zA-Z0-9+#.]{2,}\b/g) ?? []).filter(
          (w) => !STOPWORDS.has(w.toLowerCase()),
        ),
      ),
    ];

    // Missing = JD keywords not covered by any user skill name
    const userSkillSet = new Set(skills.map((s) => s.name.toLowerCase()));
    const missingKeywords = jdKeywords
      .filter((w) => !userSkillSet.has(w.toLowerCase()))
      .slice(0, 4);

    // Score: ratio of matched skills to the larger of (user skills, JD keywords), soft-capped
    const denominator = Math.max(skills.length, jdKeywords.length, 1);
    const raw = (matched.length / denominator) * 100;
    const score = Math.min(95, Math.max(5, Math.round(raw)));

    return {
      score,
      matchedSkills: matched.slice(0, 5).map((s) => s.name),
      missingKeywords,
    };
  }

  async getJob(userId: string, captureId: string) {
    const capture = await this.captureRepo.findOne({ where: { id: captureId } });
    if (!capture) throw new NotFoundException('Job not found');
    if (capture.userId !== userId) throw new ForbiddenException();

    const parsedJd = await this.jdRepo.findOne({ where: { captureId } });
    const radarItem = await this.radarRepo.findOne({ where: { captureId } });
    const matchResult = parsedJd
      ? await this.matchRepo.findOne({ where: { parsedJdId: parsedJd.id, userId } })
      : null;
    const companyBrief = parsedJd?.company
      ? await this.companyRepo.findOne({ where: { company: parsedJd.company } })
      : null;

    const risks = companyBrief?.risks as Record<string, boolean> | null | undefined;
    const riskSignals = risks
      ? Object.entries(risks).filter(([, v]) => v).map(([k]) => k)
      : [];

    return {
      id: capture.id,
      title: parsedJd?.title ?? null,
      company: parsedJd?.company ?? null,
      status: radarItem?.status ?? 'BROWSED',
      companyBrief: companyBrief ? {
        name: companyBrief.company,
        summary: companyBrief.whatTheyDo ?? null,
        riskSignals,
      } : null,
      parsedJd: parsedJd ? {
        hardSkills: (parsedJd.hardSkills as string[]) ?? [],
        softSkills: (parsedJd.softSkills as string[]) ?? [],
        experienceYears: (parsedJd.experience as Record<string, unknown> | null)?.['yearsMin'] as number ?? null,
        niceToHave: (parsedJd.niceToHave as string[]) ?? [],
        hiddenSignals: (parsedJd.hiddenSignals as string[]) ?? [],
      } : null,
      matchResult: matchResult ? {
        surfaceScore: matchResult.surfaceScore ?? 0,
        deepScore: matchResult.deepScore ?? 0,
        gaps: (matchResult.gaps as string[]) ?? [],
        hitsSurface: (matchResult.hitsSurface as string[]) ?? [],
        hitsDeep: (matchResult.hitsDeep as string[]) ?? [],
        adviceRationale: matchResult.adviceRationale ?? null,
      } : null,
    };
  }

  async listRadar(userId: string) {
    const items = await this.radarRepo.find({
      where: { userId },
      order: { lastStatusAt: 'DESC' },
    });

    if (items.length === 0) {
      return [];
    }

    // Get unique captureIds (filter out nulls)
    const captureIds = items.filter((i) => i.captureId).map((i) => i.captureId!);

    // Fetch related captures and parsed JDs only if there are captureIds
    const captureMap = new Map<string, JobCapture>();
    const jdMap = new Map<string, JobParsedJd>();

    if (captureIds.length > 0) {
      const captures = await this.captureRepo.find({
        where: captureIds.map((id) => ({ id })),
      });
      captures.forEach((c) => captureMap.set(c.id, c));

      const parsedJds = await this.jdRepo.find({
        where: captureIds.map((id) => ({ captureId: id })),
      });
      parsedJds.forEach((jd) => jdMap.set(jd.captureId, jd));
    }

    return items.map((item) => {
      const capture = item.captureId ? captureMap.get(item.captureId) : null;
      const jd = item.captureId ? jdMap.get(item.captureId) : null;
      return {
        id: item.id,
        status: item.status,
        lastActivity: item.lastStatusAt,
        captureId: item.captureId,
        parsedJdId: jd?.id ?? item.parsedJdId ?? null,
        jobTitle: jd?.title ?? null,
        companyName: jd?.company ?? null,
        sourceUrl: capture?.sourceUrl ?? null,
      };
    });
  }

  async updateRadarStatus(
    userId: string,
    radarItemId: string,
    newStatus: string,
    note?: string,
  ): Promise<JobRadarItem> {
    const item = await this.radarRepo.findOne({ where: { id: radarItemId } });
    if (!item) throw new NotFoundException('Radar item not found');
    if (item.userId !== userId) throw new ForbiddenException();

    const allowed = VALID_RADAR_TRANSITIONS[item.status] ?? [];
    if (!allowed.includes(newStatus)) {
      throw new ForbiddenException(`Cannot transition from ${item.status} to ${newStatus}`);
    }

    item.status = newStatus;
    item.lastStatusAt = new Date();
    if (note !== undefined) item.userDecisionNote = note;
    return this.radarRepo.save(item);
  }
}
