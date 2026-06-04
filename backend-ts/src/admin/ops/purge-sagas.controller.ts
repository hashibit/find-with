import { Controller, Get, Post, Param, Query, UseGuards, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AdminGuard } from '../admin.guard.js';
import { AccountPurgeSaga, PurgeSagaStep } from '../../database/entities/iam/account-purge-saga.entity.js';
import { AuditLog } from '../../database/entities/admin/audit-log.entity.js';

@Controller('admin/ops/purge-sagas')
@UseGuards(AdminGuard)
export class PurgeSagasAdminController {
  constructor(
    @InjectRepository(AccountPurgeSaga)
    private readonly repo: Repository<AccountPurgeSaga>,
    @InjectRepository(AuditLog)
    private readonly auditRepo: Repository<AuditLog>,
  ) {}

  @Get()
  async list(
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    const take = Math.min(Number(limit) || 20, 100);
    const skip = (Math.max(Number(page) || 1, 1) - 1) * take;
    const [data, total] = await this.repo.findAndCount({
      order: { createdAt: 'DESC' },
      take,
      skip,
    });
    return { data, total, page: Number(page), limit: take };
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    const saga = await this.repo.findOneBy({ id });
    if (!saga) throw new NotFoundException();
    return saga;
  }

  @Post(':id/retry')
  async retry(@Param('id') id: string) {
    const saga = await this.repo.findOneBy({ id });
    if (!saga) throw new NotFoundException();
    if (saga.step !== PurgeSagaStep.DEAD_LETTER) {
      throw new BadRequestException(`Saga is in step ${saga.step}, not DEAD_LETTER`);
    }
    saga.step = PurgeSagaStep.INITIATED;
    saga.expiresAt = new Date(Date.now() - 1000);
    saga.errorMessage = null;
    saga.deadLetterRunbookUrl = null;
    await this.repo.save(saga);
    const log = this.auditRepo.create({ action: 'purge_saga.retry', targetId: saga.id, note: `Reset from DEAD_LETTER` });
    await this.auditRepo.save(log);
    return saga;
  }
}
