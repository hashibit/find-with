import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { AccountPurgeSaga, PurgeSagaStep } from '../../../database/entities/iam/account-purge-saga.entity.js';
import { IamService } from '../iam.service.js';
import { ulid } from 'ulid';

const GRACE_PERIOD_HOURS = 24;
const RUNBOOK_URL = 'https://docs.findwith.com/runbook/account-purge-deadletter';

@Injectable()
export class AccountPurgeSagaService {
  private readonly logger = new Logger(AccountPurgeSagaService.name);

  constructor(
    @InjectRepository(AccountPurgeSaga)
    private readonly sagaRepo: Repository<AccountPurgeSaga>,
    private readonly iamService: IamService,
  ) {}

  /** Initiate account deletion: soft-delete user, start 24h grace period. */
  async initiate(userId: string): Promise<{ expiresAt: Date }> {
    const expiresAt = new Date(Date.now() + GRACE_PERIOD_HOURS * 3600 * 1000);

    await this.sagaRepo.save(
      this.sagaRepo.create({
        id: ulid(),
        userId,
        step: PurgeSagaStep.INITIATED,
        expiresAt,
        cancelled: false,
      }),
    );

    // Soft-delete the user immediately (hard delete deferred to gdpr_purge after 30d)
    await this.iamService.softDelete(userId);

    return { expiresAt };
  }

  /** Cancel deletion if still in grace period. */
  async cancelDeletion(userId: string): Promise<void> {
    const saga = await this.sagaRepo.findOne({
      where: { userId, cancelled: false },
      order: { createdAt: 'DESC' },
    });

    if (!saga) {
      throw new NotFoundException('No pending deletion request found');
    }
    if (!saga.expiresAt || saga.expiresAt <= new Date()) {
      throw new BadRequestException('Grace period has expired, deletion cannot be cancelled');
    }

    saga.cancelled = true;
    await this.sagaRepo.save(saga);

    // Restore the soft-deleted user
    await this.iamService.restoreUser(userId);
  }

  /**
   * Process sagas past their grace period. Called by the scheduled job.
   * Each step is idempotent and persisted before advancing.
   */
  async processPendingSagas(): Promise<void> {
    const now = new Date();
    const sagas = await this.sagaRepo.find({
      where: { step: PurgeSagaStep.INITIATED, cancelled: false },
    });

    for (const saga of sagas) {
      if (!saga.expiresAt || saga.expiresAt > now) continue;

      try {
        await this.runSteps(saga);
      } catch (err) {
        this.logger.error(`Saga ${saga.id} failed at step ${saga.step}`, err);
        await this.sagaRepo.update(saga.id, {
          step: PurgeSagaStep.DEAD_LETTER,
          deadLetterRunbookUrl: RUNBOOK_URL,
          errorMessage: String(err),
        });
      }
    }
  }

  private async runSteps(saga: AccountPurgeSaga): Promise<void> {
    // Step 1: Cancel Stripe subscription
    if (saga.step === PurgeSagaStep.INITIATED) {
      // In production: retrieve sub by userId and call stripe.subscriptions.cancel(...)
      this.logger.log(`[saga:${saga.id}] Stripe customer deletion for user ${saga.userId} (stub)`);
      await this.sagaRepo.update(saga.id, { step: PurgeSagaStep.STRIPE_DELETED });
      saga.step = PurgeSagaStep.STRIPE_DELETED;
    }

    // Step 2: Delete from Clerk
    if (saga.step === PurgeSagaStep.STRIPE_DELETED) {
      this.logger.log(`[saga:${saga.id}] Clerk user deletion for user ${saga.userId} (stub)`);
      await this.sagaRepo.update(saga.id, { step: PurgeSagaStep.CLERK_DELETED });
      saga.step = PurgeSagaStep.CLERK_DELETED;
    }

    // Step 3: Ensure user is soft-deleted (may already be from initiate)
    if (saga.step === PurgeSagaStep.CLERK_DELETED) {
      await this.iamService.softDelete(saga.userId);
      await this.sagaRepo.update(saga.id, { step: PurgeSagaStep.DATA_DELETED });
      saga.step = PurgeSagaStep.DATA_DELETED;
    }

    if (saga.step === PurgeSagaStep.DATA_DELETED) {
      await this.sagaRepo.update(saga.id, { step: PurgeSagaStep.COMPLETED });
    }
  }
}
