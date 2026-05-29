import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { JobsController } from './jobs.controller.js';
import { JobsService, JOB_ANALYZE_QUEUE } from './jobs.service.js';
import { JobsProcessor } from './jobs.processor.js';
import { JobCapture } from '../../database/entities/jobs/job-capture.entity.js';
import { JobParsedJd } from '../../database/entities/jobs/parsed-jd.entity.js';
import { JobCompanyBrief } from '../../database/entities/jobs/company-brief.entity.js';
import { JobMatchResult } from '../../database/entities/jobs/match-result.entity.js';
import { JobRadarItem } from '../../database/entities/jobs/radar-item.entity.js';
import { ProfileModule } from '../profile/profile.module.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([JobCapture, JobParsedJd, JobCompanyBrief, JobMatchResult, JobRadarItem]),
    BullModule.registerQueue({ name: JOB_ANALYZE_QUEUE }),
    ProfileModule,
  ],
  controllers: [JobsController],
  providers: [JobsService, JobsProcessor],
  exports: [JobsService],
})
export class JobsModule {}
