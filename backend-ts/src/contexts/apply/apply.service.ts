import { Injectable, NotFoundException, ForbiddenException, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ApplyFillPlan } from '../../database/entities/apply/fill-plan.entity.js';
import { ApplyApplication } from '../../database/entities/apply/application.entity.js';
import { JobRadarItem } from '../../database/entities/jobs/radar-item.entity.js';
import { JobParsedJd } from '../../database/entities/jobs/parsed-jd.entity.js';
import { ProfileProfile } from '../../database/entities/profile/profile.entity.js';
import { ulid } from 'ulid';
import { LLM_PROVIDER, type LlmProvider } from '@/llm/llm-provider.interface.js';
import { Type } from '@sinclair/typebox';

@Injectable()
export class ApplyService {
  constructor(
    @InjectRepository(ApplyFillPlan) private readonly planRepo: Repository<ApplyFillPlan>,
    @InjectRepository(ApplyApplication) private readonly appRepo: Repository<ApplyApplication>,
    @InjectRepository(JobRadarItem) private readonly radarRepo: Repository<JobRadarItem>,
    @InjectRepository(JobParsedJd) private readonly jdRepo: Repository<JobParsedJd>,
    @InjectRepository(ProfileProfile) private readonly profileRepo: Repository<ProfileProfile>,
    @Inject(LLM_PROVIDER) private readonly llm: LlmProvider,
  ) {}

  async generateFillPlan(userId: string, radarItemId: string): Promise<ApplyFillPlan> {
    const radarItem = await this.radarRepo.findOne({ where: { id: radarItemId } });
    if (!radarItem) throw new NotFoundException('Radar item not found');
    if (radarItem.userId !== userId) throw new ForbiddenException();

    const parsedJd = radarItem.parsedJdId
      ? await this.jdRepo.findOne({ where: { id: radarItem.parsedJdId } })
      : null;

    const profile = await this.profileRepo.findOne({ where: { userId } });
    const info = (profile?.basicInfo ?? {}) as Record<string, string>;

    // Generate field plan via LLM
    const FillPlanSchema = Type.Array(Type.Object({
      fieldName: Type.String(),
      fieldType: Type.String(),
      value: Type.String(),
      source: Type.String(),
    }));

    const fields = await this.llm.structuredComplete(
      {
        systemPrompt:
          'You generate LinkedIn Easy Apply field plans. Use the candidate info exactly as provided — do NOT modify names, emails, or phone numbers.',
        messages: [
          {
            role: 'user',
            content: `Generate a fill plan for this job application.

Job: ${parsedJd?.title ?? 'Unknown'} at ${parsedJd?.company ?? 'Unknown'}

Candidate info (use exactly as-is, do not invent or modify):
- Full name: ${info['fullName'] ?? ''}
- Email: ${info['email'] ?? ''}
- Phone: ${info['phone'] ?? ''}
- Location: ${info['location'] ?? ''}`,
            timestamp: Date.now(),
          },
        ],
      },
      FillPlanSchema,
    );

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
