import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan, MoreThan, IsNull, Not } from 'typeorm';
import { FollowupEmail } from '../../database/entities/followup/followup-email.entity.js';
import { JobRadarItem } from '../../database/entities/jobs/radar-item.entity.js';
import { AccountPurgeSaga } from '../../database/entities/iam/account-purge-saga.entity.js';
import { GdprPurgeLog } from '../../database/entities/iam/gdpr-purge-log.entity.js';
import { IamUser } from '../../database/entities/iam/iam-user.entity.js';
import { AccountPurgeSagaService } from '../iam/services/account-purge-saga.service.js';
import { ulid } from 'ulid';

@Injectable()
export class FollowupSchedulerService {
  private readonly logger = new Logger(FollowupSchedulerService.name);

  constructor(
    @InjectRepository(FollowupEmail)
    private readonly emailRepo: Repository<FollowupEmail>,
    @InjectRepository(JobRadarItem)
    private readonly radarRepo: Repository<JobRadarItem>,
    @InjectRepository(GdprPurgeLog)
    private readonly gdprLogRepo: Repository<GdprPurgeLog>,
    @InjectRepository(IamUser)
    private readonly userRepo: Repository<IamUser>,
    private readonly purgeSagaService: AccountPurgeSagaService,
  ) {}

  /**
   * Hourly: find applications that haven't had followup contact at the +3/+8/+15 day
   * checkpoints and enqueue a followup prompt.
   * In v0.1 this logs the intent; in v0.2 it will push a SSE nudge via a conversation.
   */
  @Cron('0 * * * *') // every hour at minute 0
  async checkPendingFollowups(): Promise<void> {
    this.logger.log('Checking pending followups...');
    const now = new Date();
    const checkpointDays = [3, 8, 15];

    for (const days of checkpointDays) {
      const windowEnd = new Date(now.getTime() - days * 86_400_000);
      const windowStart = new Date(windowEnd.getTime() - 3_600_000); // 1-hour window

      // Radar items submitted in the window and still in APPLIED state (no response)
      const items = await this.radarRepo.find({
        where: {
          status: 'APPLIED',
          lastStatusAt: MoreThan(windowStart),
        },
      });

      const due = items.filter((i) => i.lastStatusAt <= windowEnd);
      if (due.length > 0) {
        this.logger.log(`${due.length} items due for ${days}-day followup`);
        // TODO v0.2: push SSE nudge via conversation service
      }
    }
  }

  /**
   * Daily at 02:00 UTC: purge email body text older than 30 days.
   * Keeps metadata (subject, fromAddr, radarItemId) but discards PII body.
   */
  @Cron('0 2 * * *')
  async purgeOldEmailBodies(): Promise<void> {
    this.logger.log('Purging email bodies older than 30 days...');
    const cutoff = new Date(Date.now() - 30 * 86_400_000);

    const result = await this.emailRepo
      .createQueryBuilder()
      .update(FollowupEmail)
      .set({ bodyText: () => 'NULL' })
      .where('"receivedAt" < :cutoff AND "bodyText" IS NOT NULL', { cutoff })
      .execute();

    this.logger.log(`Email purge: ${result.affected ?? 0} rows cleared`);
  }

  /**
   * Daily at 03:00 UTC: hard-delete users soft-deleted more than 30 days ago.
   * Cascade deletes happen via FK constraints; this just removes the user row
   * and records a purge log entry.
   */
  @Cron('0 3 * * *')
  async runGdprPurge(): Promise<void> {
    this.logger.log('Running GDPR hard-delete purge...');
    const cutoff = new Date(Date.now() - 30 * 86_400_000);

    const deletedUsers = await this.userRepo.find({
      where: {
        isActive: false,
        deletedAt: LessThan(cutoff),
      },
    });

    for (const user of deletedUsers) {
      try {
        await this.userRepo.manager.transaction(async (em) => {
          // Hard-delete the user (FKs with CASCADE handle child tables)
          await em.delete(IamUser, { id: user.id });

          // Record compliance evidence
          await em.save(
            em.create(GdprPurgeLog, {
              id: ulid(),
              userId: user.id,
              purgedAt: new Date(),
              deletedRowCounts: { users: 1 },
            }),
          );
        });
        this.logger.log(`GDPR purge: hard-deleted user ${user.id}`);
      } catch (err) {
        this.logger.error(`GDPR purge failed for user ${user.id}`, err);
      }
    }

    this.logger.log(`GDPR purge complete: ${deletedUsers.length} users processed`);
  }

  /**
   * Daily at 04:00 UTC: advance AccountPurgeSagas whose grace period has elapsed.
   */
  @Cron('0 4 * * *')
  async processPurgeSagas(): Promise<void> {
    this.logger.log('Processing account purge sagas...');
    await this.purgeSagaService.processPendingSagas();
  }
}
