import { Injectable, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { QuotaUsageCounter } from '../../database/entities/quota/quota-counter.entity';
import { QuotaConsumeLog } from '../../database/entities/quota/quota-log.entity';
import { ulid } from 'ulid';

@Injectable()
export class QuotaService {
  constructor(
    @InjectRepository(QuotaUsageCounter)
    private readonly counterRepo: Repository<QuotaUsageCounter>,
    @InjectRepository(QuotaConsumeLog)
    private readonly logRepo: Repository<QuotaConsumeLog>,
  ) {}

  async getCounter(userId: string): Promise<QuotaUsageCounter> {
    let counter = await this.counterRepo.findOne({ where: { userId } });
    if (!counter) {
      counter = this.counterRepo.create({ userId, tailoringCompleted: 0, tailoringLimit: 3 });
      await this.counterRepo.save(counter);
    }
    return counter;
  }

  async getRemaining(userId: string): Promise<number> {
    const counter = await this.getCounter(userId);
    return Math.max(0, counter.tailoringLimit - counter.tailoringCompleted);
  }

  /**
   * Consume one tailoring quota slot on export.
   * Idempotent: the UNIQUE constraint on tailoredResumeId prevents double-charge.
   * Throws ForbiddenException if quota exhausted.
   */
  async consumeOnExport(userId: string, tailoredResumeId: string): Promise<void> {
    // Check for existing consumption (idempotent retry safety)
    const existing = await this.logRepo.findOne({ where: { tailoredResumeId } });
    if (existing) return;

    const counter = await this.getCounter(userId);
    if (counter.tailoringCompleted >= counter.tailoringLimit) {
      throw new ForbiddenException('Tailoring quota exhausted. Upgrade to Pro for unlimited exports.');
    }

    // Atomic increment + log in a transaction
    await this.counterRepo.manager.transaction(async (em) => {
      await em.increment(QuotaUsageCounter, { userId }, 'tailoringCompleted', 1);
      await em.save(
        em.create(QuotaConsumeLog, {
          id: ulid(),
          userId,
          tailoredResumeId,
          consumedAt: new Date(),
        }),
      );
    });
  }

  /** Pro users get effectively unlimited quota (set limit to a large number). */
  async setProLimit(userId: string): Promise<void> {
    await this.counterRepo.upsert({ userId, tailoringLimit: 999999 }, ['userId']);
  }

  async resetToFreeLimit(userId: string): Promise<void> {
    await this.counterRepo.upsert({ userId, tailoringLimit: 3, tailoringCompleted: 0, windowStart: new Date() }, ['userId']);
  }
}
