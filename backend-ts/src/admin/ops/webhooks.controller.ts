import { Controller, Get, Param, Query, UseGuards, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AdminGuard } from '../admin.guard.js';
import { IamWebhookEvent } from '../../database/entities/iam/webhook-event.entity.js';

@Controller('admin/ops/webhooks')
@UseGuards(AdminGuard)
export class WebhooksAdminController {
  constructor(
    @InjectRepository(IamWebhookEvent)
    private readonly repo: Repository<IamWebhookEvent>,
  ) {}

  @Get()
  async list(
    @Query('page') page = '1',
    @Query('limit') limit = '20',
    @Query('provider') provider?: string,
    @Query('eventType') eventType?: string,
  ) {
    const take = Math.min(Number(limit) || 20, 100);
    const skip = (Math.max(Number(page) || 1, 1) - 1) * take;
    const where: Record<string, unknown> = {};
    if (provider) where['provider'] = provider;
    if (eventType) where['eventType'] = eventType;
    const [data, total] = await this.repo.findAndCount({
      where,
      order: { processedAt: 'DESC' },
      take,
      skip,
    });
    return { data, total, page: Number(page), limit: take };
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    const event = await this.repo.findOneBy({ id });
    if (!event) throw new NotFoundException();
    return event;
  }
}
