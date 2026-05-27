import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppConfig } from '../config/configuration';
import { IamUser } from './entities/iam/iam-user.entity';
import { IamSettings } from './entities/iam/iam-settings.entity';
import { ProfileResumeSource } from './entities/profile/resume-source.entity';
import { ProfileProfile } from './entities/profile/profile.entity';
import { ProfileEducation } from './entities/profile/education.entity';
import { ProfileWorkExperience } from './entities/profile/work-experience.entity';
import { ProfileProject } from './entities/profile/project.entity';
import { ProfileSkill } from './entities/profile/skill.entity';
import { ProfileMaterial } from './entities/profile/material.entity';
import { ProfileBaseResume } from './entities/profile/base-resume.entity';
import { JobCapture } from './entities/jobs/job-capture.entity';
import { JobParsedJd } from './entities/jobs/parsed-jd.entity';
import { JobCompanyBrief } from './entities/jobs/company-brief.entity';
import { JobMatchResult } from './entities/jobs/match-result.entity';
import { JobRadarItem } from './entities/jobs/radar-item.entity';
import { ConvConversation } from './entities/conversation/conversation.entity';
import { ConvMessage } from './entities/conversation/message.entity';
import { TailoringResume } from './entities/tailoring/tailoring-resume.entity';
import { TailoringSnapshot } from './entities/tailoring/tailoring-snapshot.entity';
import { ApplyFillPlan } from './entities/apply/fill-plan.entity';
import { ApplyApplication } from './entities/apply/application.entity';
import { FollowupEmail } from './entities/followup/followup-email.entity';
import { FollowupDraft } from './entities/followup/followup-draft.entity';
import { BillingSubscription } from './entities/billing/subscription.entity';
import { QuotaUsageCounter } from './entities/quota/quota-counter.entity';
import { QuotaConsumeLog } from './entities/quota/quota-log.entity';
import { RecoRecommendation } from './entities/recommendation/recommendation.entity';
import { TelemetryEvent } from './entities/telemetry/telemetry-event.entity';
import { OutboxEvent } from './entities/outbox/outbox-event.entity';
import { IdempotencyKey } from './entities/idempotency/idempotency-key.entity';

export const ALL_ENTITIES = [
  IamUser,
  IamSettings,
  ProfileResumeSource,
  ProfileProfile,
  ProfileEducation,
  ProfileWorkExperience,
  ProfileProject,
  ProfileSkill,
  ProfileMaterial,
  ProfileBaseResume,
  JobCapture,
  JobParsedJd,
  JobCompanyBrief,
  JobMatchResult,
  JobRadarItem,
  ConvConversation,
  ConvMessage,
  TailoringResume,
  TailoringSnapshot,
  ApplyFillPlan,
  ApplyApplication,
  FollowupEmail,
  FollowupDraft,
  BillingSubscription,
  QuotaUsageCounter,
  QuotaConsumeLog,
  RecoRecommendation,
  TelemetryEvent,
  OutboxEvent,
  IdempotencyKey,
];

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig>) => {
        const dbUrl = config.get('database', { infer: true })!.url;
        const isProduction = config.get('env', { infer: true }) === 'production';
        return {
          type: 'postgres',
          url: dbUrl,
          entities: ALL_ENTITIES,
          synchronize: false,
          ssl: isProduction ? { rejectUnauthorized: false } : false,
          logging: !isProduction,
        };
      },
    }),
  ],
  exports: [TypeOrmModule],
})
export class DatabaseModule {}
