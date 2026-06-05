import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { TailoringController } from './tailoring.controller.js';
import { TailoringService, TAILORING_QUEUE } from './tailoring.service.js';
import { TailoringProcessor } from './tailoring.processor.js';
import { TailoringResume } from '../../database/entities/tailoring/tailoring-resume.entity.js';
import { TailoringBullet } from '../../database/entities/tailoring/tailoring-bullet.entity.js';
import { TailoringSnapshot } from '../../database/entities/tailoring/tailoring-snapshot.entity.js';
import { JobParsedJd } from '../../database/entities/jobs/parsed-jd.entity.js';
import { ProfileBaseResume } from '../../database/entities/profile/base-resume.entity.js';
import { ProfileMaterial } from '../../database/entities/profile/material.entity.js';
import { QuotaModule } from '../quota/quota.module.js';
import { ProfileModule } from '../profile/profile.module.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([TailoringResume, TailoringBullet, TailoringSnapshot, JobParsedJd, ProfileBaseResume, ProfileMaterial]),
    BullModule.registerQueue({ name: TAILORING_QUEUE }),
    QuotaModule,
    ProfileModule,
  ],
  controllers: [TailoringController],
  providers: [TailoringService, TailoringProcessor],
})
export class TailoringModule {}
