import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan } from 'typeorm';
import { IamUser } from '../../database/entities/iam/iam-user.entity.js';
import { BillingSubscription } from '../../database/entities/billing/subscription.entity.js';
import { QuotaConsumeLog } from '../../database/entities/quota/quota-log.entity.js';
import { TelemetryEvent } from '../../database/entities/telemetry/telemetry-event.entity.js';
import { AccountPurgeSaga } from '../../database/entities/iam/account-purge-saga.entity.js';

@Injectable()
export class MetricsService {
  constructor(
    @InjectRepository(IamUser) private readonly userRepo: Repository<IamUser>,
    @InjectRepository(BillingSubscription)
    private readonly subRepo: Repository<BillingSubscription>,
    @InjectRepository(QuotaConsumeLog)
    private readonly quotaLogRepo: Repository<QuotaConsumeLog>,
    @InjectRepository(TelemetryEvent)
    private readonly telemetryRepo: Repository<TelemetryEvent>,
    @InjectRepository(AccountPurgeSaga)
    private readonly sagaRepo: Repository<AccountPurgeSaga>,
  ) {}

  async getUsersOverview(): Promise<{ total: number; newToday: number; newLast7d: number }> {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const last7d = new Date(Date.now() - 7 * 24 * 3600 * 1000);

    const [total, newToday, newLast7d] = await Promise.all([
      this.userRepo.count(),
      this.userRepo.count({ where: { createdAt: MoreThan(startOfToday) } }),
      this.userRepo.count({ where: { createdAt: MoreThan(last7d) } }),
    ]);
    return { total, newToday, newLast7d };
  }

  async getConversionLast30d(): Promise<{ proConversions: number }> {
    const last30d = new Date(Date.now() - 30 * 24 * 3600 * 1000);
    const proConversions = await this.subRepo
      .createQueryBuilder('sub')
      .where('sub.tier = :tier', { tier: 'PRO' })
      .andWhere('sub.updatedAt > :since', { since: last30d })
      .getCount();
    return { proConversions };
  }

  async getOperationsToday(): Promise<{ tailoringsToday: number }> {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const tailoringsToday = await this.quotaLogRepo.count({
      where: { consumedAt: MoreThan(startOfToday) },
    });
    return { tailoringsToday };
  }

  async getOfferMetrics(): Promise<{ offerAcceptedTotal: number; offerAcceptedLast30d: number }> {
    const last30d = new Date(Date.now() - 30 * 24 * 3600 * 1000);
    const [offerAcceptedTotal, offerAcceptedLast30d] = await Promise.all([
      this.telemetryRepo.count({ where: { eventType: 'offer_accepted' } }),
      this.telemetryRepo
        .createQueryBuilder('t')
        .where('t.eventType = :et', { et: 'offer_accepted' })
        .andWhere('t.createdAt > :since', { since: last30d })
        .getCount(),
    ]);
    return { offerAcceptedTotal, offerAcceptedLast30d };
  }

  async getAgentIterationExhaustedToday(): Promise<{ agentIterationExhaustedToday: number }> {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const agentIterationExhaustedToday = await this.telemetryRepo
      .createQueryBuilder('t')
      .where('t.eventType = :et', { et: 'agent.iteration_exhausted' })
      .andWhere('t.createdAt > :since', { since: startOfToday })
      .getCount();
    return { agentIterationExhaustedToday };
  }

  async getOverview(): Promise<{
    users: { total: number; newToday: number; newLast7d: number };
    conversion: { proConversions: number };
    operations: { tailoringsToday: number };
    offers: { offerAcceptedTotal: number; offerAcceptedLast30d: number };
    agent: { agentIterationExhaustedToday: number };
  }> {
    const [users, conversion, operations, offers, agent] = await Promise.all([
      this.getUsersOverview(),
      this.getConversionLast30d(),
      this.getOperationsToday(),
      this.getOfferMetrics(),
      this.getAgentIterationExhaustedToday(),
    ]);
    return { users, conversion, operations, offers, agent };
  }
}
