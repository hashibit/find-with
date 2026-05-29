import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ApplyFillPlan } from '../../database/entities/apply/fill-plan.entity.js';
import { ApplyApplication } from '../../database/entities/apply/application.entity.js';
import { JobRadarItem } from '../../database/entities/jobs/radar-item.entity.js';
import { JobParsedJd } from '../../database/entities/jobs/parsed-jd.entity.js';
import { LlmService } from '../../llm/llm.service.js';
import { ulid } from 'ulid';

@Injectable()
export class ApplyService {
  constructor(
    @InjectRepository(ApplyFillPlan) private readonly planRepo: Repository<ApplyFillPlan>,
    @InjectRepository(ApplyApplication) private readonly appRepo: Repository<ApplyApplication>,
    @InjectRepository(JobRadarItem) private readonly radarRepo: Repository<JobRadarItem>,
    @InjectRepository(JobParsedJd) private readonly jdRepo: Repository<JobParsedJd>,
    private readonly llm: LlmService,
  ) {}

  async generateFillPlan(userId: string, radarItemId: string): Promise<ApplyFillPlan> {
    const radarItem = await this.radarRepo.findOne({ where: { id: radarItemId } });
    if (!radarItem) throw new NotFoundException('Radar item not found');
    if (radarItem.userId !== userId) throw new ForbiddenException();

    const parsedJd = radarItem.parsedJdId
      ? await this.jdRepo.findOne({ where: { id: radarItem.parsedJdId } })
      : null;

    // Generate field plan via LLM
    const raw = await this.llm.completeContext({
      systemPrompt:
        'You generate LinkedIn Easy Apply field plans. Output JSON array of field objects.',
      messages: [
        {
          role: 'user',
          content: `Generate a fill plan for this job:\nTitle: ${parsedJd?.title ?? 'Unknown'}\nCompany: ${parsedJd?.company ?? 'Unknown'}\n\nReturn JSON: [{ "fieldName": string, "fieldType": string, "value": string, "source": string }]`,
          timestamp: Date.now(),
        },
      ],
    });

    let fields: unknown[] = [];
    try {
      const m = raw.match(/\[[\s\S]*\]/);
      if (m) fields = JSON.parse(m[0]) as unknown[];
    } catch {
      /* ignore */
    }

    const plan = this.planRepo.create({
      id: ulid(),
      radarItemId,
      userId,
      fields,
      previewSummary: `Fill plan for ${parsedJd?.title ?? 'job'} at ${parsedJd?.company ?? 'company'}`,
    });
    return this.planRepo.save(plan);
  }

  async approvePlan(userId: string, planId: string): Promise<ApplyFillPlan> {
    const plan = await this.planRepo.findOne({ where: { id: planId } });
    if (!plan) throw new NotFoundException();
    if (plan.userId !== userId) throw new ForbiddenException();
    plan.userApproved = true;
    plan.approvedAt = new Date();
    return this.planRepo.save(plan);
  }

  async recordSubmission(
    userId: string,
    radarItemId: string,
    resumeSnapshotId?: string,
  ): Promise<ApplyApplication> {
    const app = this.appRepo.create({
      id: ulid(),
      userId,
      radarItemId,
      resumeSnapshotId: resumeSnapshotId ?? null,
    });
    await this.appRepo.save(app);
    await this.radarRepo.update(
      { id: radarItemId },
      { status: 'APPLIED', lastStatusAt: new Date() },
    );
    return app;
  }
}
