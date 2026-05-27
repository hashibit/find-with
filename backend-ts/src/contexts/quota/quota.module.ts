import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { QuotaService } from './quota.service.js';
import { QuotaUsageCounter } from '../../database/entities/quota/quota-counter.entity.js';
import { QuotaConsumeLog } from '../../database/entities/quota/quota-log.entity.js';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([QuotaUsageCounter, QuotaConsumeLog])],
  providers: [QuotaService],
  exports: [QuotaService],
})
export class QuotaModule {}
