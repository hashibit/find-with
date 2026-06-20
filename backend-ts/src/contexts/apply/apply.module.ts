import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ApplyController } from './apply.controller.js';
import { ApplyService } from './apply.service.js';
import { ApplyFillPlan } from '../../database/entities/apply/fill-plan.entity.js';
import { ApplyApplication } from '../../database/entities/apply/application.entity.js';
import { JobRadarItem } from '../../database/entities/jobs/radar-item.entity.js';
import { JobParsedJd } from '../../database/entities/jobs/parsed-jd.entity.js';
import { ProfileProfile } from '../../database/entities/profile/profile.entity.js';

@Module({
  imports: [TypeOrmModule.forFeature([ApplyFillPlan, ApplyApplication, JobRadarItem, JobParsedJd, ProfileProfile])],
  controllers: [ApplyController],
  providers: [ApplyService],
})
export class ApplyModule {}
