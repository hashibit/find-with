import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IamUser } from '../../database/entities/iam/iam-user.entity';
import { IamSettings } from '../../database/entities/iam/iam-settings.entity';
import { QuotaUsageCounter } from '../../database/entities/quota/quota-counter.entity';
import { BillingSubscription } from '../../database/entities/billing/subscription.entity';
import { ulid } from 'ulid';

@Injectable()
export class IamService {
  constructor(
    @InjectRepository(IamUser)
    private readonly userRepo: Repository<IamUser>,
    @InjectRepository(IamSettings)
    private readonly settingsRepo: Repository<IamSettings>,
    @InjectRepository(QuotaUsageCounter)
    private readonly quotaRepo: Repository<QuotaUsageCounter>,
    @InjectRepository(BillingSubscription)
    private readonly billingRepo: Repository<BillingSubscription>,
  ) {}

  async upsert(clerkUserId: string, email: string, fullName?: string): Promise<IamUser> {
    let user = await this.userRepo.findOne({ where: { clerkUserId } });

    if (!user) {
      user = this.userRepo.create({ id: ulid(), clerkUserId, email, fullName: fullName ?? null });
      await this.userRepo.save(user);

      // Bootstrap settings, quota, and free subscription
      await Promise.all([
        this.settingsRepo.save(this.settingsRepo.create({ userId: user.id })),
        this.quotaRepo.save(this.quotaRepo.create({ userId: user.id })),
        this.billingRepo.save(
          this.billingRepo.create({ id: ulid(), userId: user.id, tier: 'FREE', state: 'ACTIVE' }),
        ),
      ]);
    } else {
      user.email = email;
      if (fullName) user.fullName = fullName;
      await this.userRepo.save(user);
    }

    return user;
  }

  async findByClerkId(clerkUserId: string): Promise<IamUser> {
    const user = await this.userRepo.findOne({ where: { clerkUserId } });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async findById(userId: string): Promise<IamUser> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async getSettings(userId: string): Promise<IamSettings> {
    const settings = await this.settingsRepo.findOne({ where: { userId } });
    if (!settings) {
      const created = this.settingsRepo.create({ userId });
      return this.settingsRepo.save(created);
    }
    return settings;
  }

  async updateSettings(
    userId: string,
    patch: Partial<Pick<IamSettings, 'density' | 'locale' | 'timezone'>>,
  ): Promise<IamSettings> {
    await this.settingsRepo.upsert({ userId, ...patch }, ['userId']);
    return this.getSettings(userId);
  }

  async softDelete(userId: string): Promise<void> {
    await this.userRepo.update({ id: userId }, { deletedAt: new Date(), isActive: false });
  }
}
