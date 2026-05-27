import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { JobsController } from './jobs.controller';
import { JobsService, JOB_ANALYZE_QUEUE } from './jobs.service';
import { JobsProcessor } from './jobs.processor';
import { JobCapture } from '../../database/entities/jobs/job-capture.entity';
import { JobParsedJd } from '../../database/entities/jobs/parsed-jd.entity';
import { JobCompanyBrief } from '../../database/entities/jobs/company-brief.entity';
import { JobMatchResult } from '../../database/entities/jobs/match-result.entity';
import { JobRadarItem } from '../../database/entities/jobs/radar-item.entity';
import { ProfileMaterial } from '../../database/entities/profile/material.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([JobCapture, JobParsedJd, JobCompanyBrief, JobMatchResult, JobRadarItem, ProfileMaterial]),
    BullModule.registerQueue({ name: JOB_ANALYZE_QUEUE }),
  ],
  controllers: [JobsController],
  providers: [JobsService, JobsProcessor],
  exports: [JobsService],
})
export class JobsModule {}
