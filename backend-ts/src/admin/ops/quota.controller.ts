import { Controller, Get, Post, Param, Query, UseGuards, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AdminGuard } from '../admin.guard.js';
import { QuotaUsageCounter } from '../../database/entities/quota/quota-counter.entity.js';

@Controller('admin/ops/quota')
@UseGuards(AdminGuard)
export class QuotaAdminController {
  constructor(
    @InjectRepository(QuotaUsageCounter)
    private readonly repo: Repository<QuotaUsageCounter>,
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
      order: { userId: 'ASC' },
      take,
      skip,
    });
    return { data, total, page: Number(page), limit: take };
  }

  @Post(':id/reset')
  async reset(@Param('id') id: string) {
    const quota = await this.repo.findOneBy({ userId: id });
    if (!quota) throw new NotFoundException();
    quota.tailoringCompleted = 0;
    quota.windowStart = new Date();
    await this.repo.save(quota);
    return quota;
  }
}
