import { Injectable, Logger, Inject } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan, MoreThan } from 'typeorm';
import { FollowupEmail } from '../../database/entities/followup/followup-email.entity.js';
import { JobRadarItem } from '../../database/entities/jobs/radar-item.entity.js';
import { JobParsedJd } from '../../database/entities/jobs/parsed-jd.entity.js';
import { ConvConversation } from '../../database/entities/conversation/conversation.entity.js';
import { ConvMessage } from '../../database/entities/conversation/message.entity.js';
import { AccountPurgeSaga } from '../../database/entities/iam/account-purge-saga.entity.js';
import { GdprPurgeLog } from '../../database/entities/iam/gdpr-purge-log.entity.js';
import { IamUser } from '../../database/entities/iam/iam-user.entity.js';
import { AccountPurgeSagaService } from '../iam/services/account-purge-saga.service.js';
import { FIELD_CRYPTO, type FieldCrypto } from '../../common/crypto/crypto.interface.js';
import { ulid } from 'ulid';

@Injectable()
export class FollowupSchedulerService {
  private readonly logger = new Logger(FollowupSchedulerService.name);

  constructor(
    @InjectRepository(FollowupEmail)
    private readonly emailRepo: Repository<FollowupEmail>,
    @InjectRepository(JobRadarItem)
    private readonly radarRepo: Repository<JobRadarItem>,
    @InjectRepository(JobParsedJd)
    private readonly parsedJdRepo: Repository<JobParsedJd>,
    @InjectRepository(ConvConversation)
    private readonly convRepo: Repository<ConvConversation>,
    @InjectRepository(ConvMessage)
    private readonly messageRepo: Repository<ConvMessage>,
    @InjectRepository(GdprPurgeLog)
    private readonly gdprLogRepo: Repository<GdprPurgeLog>,
    @InjectRepository(IamUser)
    private readonly userRepo: Repository<IamUser>,
    @Inject(FIELD_CRYPTO)
    private readonly fieldCrypto: FieldCrypto,
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
      if (due.length === 0) continue;

      this.logger.log(`${due.length} items due for ${days}-day followup`);

      for (const item of due) {
        await this.createNudgeIfAbsent(item, days);
      }
    }
  }

  /**
   * Create a FOLLOWUP conversation with a Quinn nudge message for the given radar item,
   * unless one already exists (idempotent — safe to call multiple times).
   * The conversation appears in the user's panel on next open without requiring SSE.
   */
  private async createNudgeIfAbsent(item: JobRadarItem, days: number): Promise<void> {
    const existing = await this.convRepo.findOne({
      where: { userId: item.userId, kind: 'FOLLOWUP', anchorId: item.id },
    });
    if (existing) return;

    let title: string | null = null;
    let company: string | null = null;
    if (item.parsedJdId) {
      const jd = await this.parsedJdRepo.findOne({ where: { id: item.parsedJdId } });
      title = jd?.title ?? null;
      company = jd?.company ?? null;
    }

    const nudgeText = this.buildNudgeText(days, title, company);

    const conv = this.convRepo.create({
      id: ulid(),
      userId: item.userId,
      kind: 'FOLLOWUP',
      anchorId: item.id,
      effectiveDensity: 'BALANCED',
      lastActivity: new Date(),
    });
    await this.convRepo.save(conv);

    const encrypted = await this.fieldCrypto.encrypt(nudgeText);
    await this.messageRepo.save(
      this.messageRepo.create({
        id: ulid(),
        conversationId: conv.id,
        role: 'ASSISTANT',
        text: null,
        encryptedText: encrypted,
        payload: {
          role: 'assistant',
          content: [{ type: 'text', text: nudgeText }],
          timestamp: Date.now(),
        },
      }),
    );

    this.logger.log(`Followup nudge created: radarItem=${item.id} day=${days}`);
  }

  private buildNudgeText(days: number, title: string | null, company: string | null): string {
    const label =
      title && company ? `${title} at ${company}` :
      title ?? company ?? 'a role you applied to';

    if (days <= 3) {
      return `${days} days ago you applied to ${label}. Any reply yet?`;
    }
    if (days <= 8) {
      return `It's been ${days} days since you applied to ${label} — still no reply. Worth sending a follow-up, or ready to move on?`;
    }
    return `${days} days since you applied to ${label}. If there's still no response, it may be time to move on. What do you want to do?`;
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
