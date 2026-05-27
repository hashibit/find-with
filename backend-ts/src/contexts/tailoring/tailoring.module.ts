import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { TailoringController } from './tailoring.controller';
import { TailoringService, TAILORING_QUEUE } from './tailoring.service';
import { TailoringProcessor } from './tailoring.processor';
import { TailoringResume } from '../../database/entities/tailoring/tailoring-resume.entity';
import { TailoringSnapshot } from '../../database/entities/tailoring/tailoring-snapshot.entity';
import { JobParsedJd } from '../../database/entities/jobs/parsed-jd.entity';
import { ProfileBaseResume } from '../../database/entities/profile/base-resume.entity';
import { ProfileMaterial } from '../../database/entities/profile/material.entity';
import { QuotaModule } from '../quota/quota.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([TailoringResume, TailoringSnapshot, JobParsedJd, ProfileBaseResume, ProfileMaterial]),
    BullModule.registerQueue({ name: TAILORING_QUEUE }),
    QuotaModule,
  ],
  controllers: [TailoringController],
  providers: [TailoringService, TailoringProcessor],
})
export class TailoringModule {}
