import { Controller, Get, Post, Param, Query, UseGuards, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AdminGuard } from '../admin.guard.js';
import { BillingSubscription } from '../../database/entities/billing/subscription.entity.js';

@Controller('admin/ops/subscriptions')
@UseGuards(AdminGuard)
export class SubscriptionsAdminController {
  constructor(
    @InjectRepository(BillingSubscription)
    private readonly repo: Repository<BillingSubscription>,
  ) {}

  @Get()
  async list(
    @Query('page') page = '1',
    @Query('limit') limit = '20',
    @Query('userId') userId?: string,
  ) {
    const take = Math.min(Number(limit) || 20, 100);
    const skip = (Math.max(Number(page) || 1, 1) - 1) * take;
    const [data, total] = await this.repo.findAndCount({
      where: userId ? { userId } : {},
      order: { createdAt: 'DESC' },
      take,
      skip,
    });
    return { data, total, page: Number(page), limit: take };
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    const sub = await this.repo.findOneBy({ id });
    if (!sub) throw new NotFoundException();
    return sub;
  }

  @Post(':id/force-dormant')
  async forceDormant(@Param('id') id: string) {
    const sub = await this.repo.findOneBy({ id });
    if (!sub) throw new NotFoundException();
    sub.state = 'CANCELLED';
    sub.tier = 'FREE';
    await this.repo.save(sub);
    return sub;
  }
}
