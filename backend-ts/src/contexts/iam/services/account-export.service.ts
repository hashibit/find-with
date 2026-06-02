import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BillingSubscription } from '../../../database/entities/billing/subscription.entity.js';
import { QuotaUsageCounter } from '../../../database/entities/quota/quota-counter.entity.js';
import { ProfileProfile } from '../../../database/entities/profile/profile.entity.js';
import { ProfileMaterial } from '../../../database/entities/profile/material.entity.js';
import { JobRadarItem } from '../../../database/entities/jobs/radar-item.entity.js';
import { ConvConversation } from '../../../database/entities/conversation/conversation.entity.js';
import { IamUser } from '../../../database/entities/iam/iam-user.entity.js';
import { IamService } from '../iam.service.js';

/**
 * Assembles the GDPR Article 20 data-portability export for a user.
 *
 * Cross-context repo access is intentionally concentrated here — this is the
 * single seam for full-account export. When contexts grow export-specific
 * interfaces (e.g. JobsService.exportForUser()), the repos can be replaced
 * by those calls without changing the controller.
 */
@Injectable()
export class AccountExportService {
  constructor(
    private readonly iamService: IamService,
    @InjectRepository(BillingSubscription)
    private readonly billingRepo: Repository<BillingSubscription>,
    @InjectRepository(QuotaUsageCounter)
    private readonly quotaRepo: Repository<QuotaUsageCounter>,
    @InjectRepository(ProfileProfile)
    private readonly profileRepo: Repository<ProfileProfile>,
    @InjectRepository(ProfileMaterial)
    private readonly materialRepo: Repository<ProfileMaterial>,
    @InjectRepository(JobRadarItem)
    private readonly radarRepo: Repository<JobRadarItem>,
    @InjectRepository(ConvConversation)
    private readonly convRepo: Repository<ConvConversation>,
  ) {}

  async export(iamUser: IamUser): Promise<Record<string, unknown>> {
    const userId = iamUser.id;
    const [settings, profile, materials, radar, subscription, quota, conversations] =
      await Promise.all([
        this.iamService.getSettings(userId),
        this.profileRepo.findOne({ where: { userId } }),
        this.materialRepo.find({ where: { userId }, order: { createdAt: 'ASC' } }),
        this.radarRepo.find({ where: { userId }, order: { createdAt: 'ASC' } }),
        this.billingRepo.findOne({ where: { userId } }),
        this.quotaRepo.findOne({ where: { userId } }),
        this.convRepo.find({ where: { userId }, order: { createdAt: 'ASC' } }),
      ]);

    return {
      exportedAt: new Date().toISOString(),
      schemaVersion: '1.0',
      user: {
        id: iamUser.id,
        email: iamUser.email,
        fullName: iamUser.fullName,
        createdAt: iamUser.createdAt,
      },
      settings: settings ?? null,
      profile: profile ?? null,
      materials,
      radar,
      subscription: subscription
        ? { tier: subscription.tier, state: subscription.state, periodEnd: subscription.periodEnd }
        : null,
      quota: quota ?? null,
      conversationSummary: {
        count: conversations.length,
        ids: conversations.map((c) => c.id),
      },
    };
  }
}
