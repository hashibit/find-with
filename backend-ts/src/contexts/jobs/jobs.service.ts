import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { JobCapture } from '../../database/entities/jobs/job-capture.entity.js';
import { JobParsedJd } from '../../database/entities/jobs/parsed-jd.entity.js';
import { JobMatchResult } from '../../database/entities/jobs/match-result.entity.js';
import { JobRadarItem } from '../../database/entities/jobs/radar-item.entity.js';
import { ulid } from 'ulid';

export const JOB_ANALYZE_QUEUE = 'JOB_ANALYZE';

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
    @InjectRepository(JobMatchResult)
    private readonly matchRepo: Repository<JobMatchResult>,
    @InjectRepository(JobRadarItem)
    private readonly radarRepo: Repository<JobRadarItem>,
    @InjectQueue(JOB_ANALYZE_QUEUE) private readonly analyzeQueue: Queue,
  ) {}

  async captureJob(
    userId: string,
    data: { source: string; sourceUrl: string; sourceJobId?: string; capturedHtml?: string; capturedText?: string; meta?: Record<string, unknown> },
  ): Promise<{ capture: JobCapture; radarItem: JobRadarItem }> {
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

    await this.analyzeQueue.add('analyze', { captureId: capture.id, userId });

    return { capture, radarItem };
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

    return { capture, parsedJd, matchResult, radarItem };
  }

  async listRadar(userId: string): Promise<JobRadarItem[]> {
    return this.radarRepo.find({ where: { userId }, order: { lastStatusAt: 'DESC' } });
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
