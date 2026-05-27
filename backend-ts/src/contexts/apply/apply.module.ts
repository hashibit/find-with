import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ApplyController } from './apply.controller';
import { ApplyService } from './apply.service';
import { ApplyFillPlan } from '../../database/entities/apply/fill-plan.entity';
import { ApplyApplication } from '../../database/entities/apply/application.entity';
import { JobRadarItem } from '../../database/entities/jobs/radar-item.entity';
import { JobParsedJd } from '../../database/entities/jobs/parsed-jd.entity';

@Module({
  imports: [TypeOrmModule.forFeature([ApplyFillPlan, ApplyApplication, JobRadarItem, JobParsedJd])],
  controllers: [ApplyController],
  providers: [ApplyService],
})
export class ApplyModule {}
