import { Controller, Get, Post, Param, Query, UseGuards, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AdminGuard } from '../admin.guard.js';
import { OutboxEvent } from '../../database/entities/outbox/outbox-event.entity.js';

@Controller('admin/ops/outbox')
@UseGuards(AdminGuard)
export class OutboxAdminController {
  constructor(
    @InjectRepository(OutboxEvent)
    private readonly repo: Repository<OutboxEvent>,
  ) {}

  @Get()
  async list(
    @Query('page') page = '1',
    @Query('limit') limit = '20',
    @Query('eventType') eventType?: string,
    @Query('consumerGroup') consumerGroup?: string,
  ) {
    const take = Math.min(Number(limit) || 20, 100);
    const skip = (Math.max(Number(page) || 1, 1) - 1) * take;
    const where: Record<string, unknown> = {};
    if (eventType) where['eventType'] = eventType;
    if (consumerGroup) where['consumerGroup'] = consumerGroup;
    const [data, total] = await this.repo.findAndCount({
      where,
      order: { createdAt: 'DESC' },
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

  @Post(':id/retry')
  async retry(@Param('id') id: string) {
    const event = await this.repo.findOneBy({ id });
    if (!event) throw new NotFoundException();
    event.dispatchedAt = null;
    await this.repo.save(event);
    return event;
  }
}
