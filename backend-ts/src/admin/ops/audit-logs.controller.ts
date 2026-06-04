import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AdminGuard } from '../admin.guard.js';
import { AuditLog } from '../../database/entities/admin/audit-log.entity.js';

@Controller('admin/ops/audit-logs')
@UseGuards(AdminGuard)
export class AuditLogsAdminController {
  constructor(
    @InjectRepository(AuditLog)
    private readonly repo: Repository<AuditLog>,
  ) {}

  @Get()
  async list(
    @Query('page') page = '1',
    @Query('limit') limit = '20',
    @Query('targetId') targetId?: string,
    @Query('action') action?: string,
  ) {
    const take = Math.min(Number(limit) || 20, 100);
    const skip = (Math.max(Number(page) || 1, 1) - 1) * take;
    const where: Record<string, unknown> = {};
    if (targetId) where['targetId'] = targetId;
    if (action) where['action'] = action;
    const [data, total] = await this.repo.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      take,
      skip,
    });
    return { data, total, page: Number(page), limit: take };
  }
}
