import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { type AppConfig } from '../config/configuration.js';
import { DatabaseService } from './database.service.js';
import { IamUser } from './entities/iam/iam-user.entity.js';
import { IamSettings } from './entities/iam/iam-settings.entity.js';
import { IamWebhookEvent } from './entities/iam/webhook-event.entity.js';
import { AccountPurgeSaga } from './entities/iam/account-purge-saga.entity.js';
import { GdprPurgeLog } from './entities/iam/gdpr-purge-log.entity.js';
import { PendingToolResult } from './entities/agent/pending-tool-result.entity.js';
import { ProfileResumeSource } from './entities/profile/resume-source.entity.js';
import { ProfileProfile } from './entities/profile/profile.entity.js';
import { ProfileEducation } from './entities/profile/education.entity.js';
import { ProfileWorkExperience } from './entities/profile/work-experience.entity.js';
import { ProfileProject } from './entities/profile/project.entity.js';
import { ProfileSkill } from './entities/profile/skill.entity.js';
import { ProfileMaterial } from './entities/profile/material.entity.js';
import { ProfileBaseResume } from './entities/profile/base-resume.entity.js';
import { JobCapture } from './entities/jobs/job-capture.entity.js';
import { JobParsedJd } from './entities/jobs/parsed-jd.entity.js';
import { JobCompanyBrief } from './entities/jobs/company-brief.entity.js';
import { JobMatchResult } from './entities/jobs/match-result.entity.js';
import { JobRadarItem } from './entities/jobs/radar-item.entity.js';
import { ConvConversation } from './entities/conversation/conversation.entity.js';
import { ConvMessage } from './entities/conversation/message.entity.js';
import { ConvRollingSummary } from './entities/conversation/rolling-summary.entity.js';
import { UserGoalMemory } from './entities/memory/user-goal-memory.entity.js';
import { TailoringResume } from './entities/tailoring/tailoring-resume.entity.js';
import { TailoringSnapshot } from './entities/tailoring/tailoring-snapshot.entity.js';
import { ApplyFillPlan } from './entities/apply/fill-plan.entity.js';
import { ApplyApplication } from './entities/apply/application.entity.js';
import { FollowupEmail } from './entities/followup/followup-email.entity.js';
import { FollowupDraft } from './entities/followup/followup-draft.entity.js';
import { BillingSubscription } from './entities/billing/subscription.entity.js';
import { QuotaUsageCounter } from './entities/quota/quota-counter.entity.js';
import { QuotaConsumeLog } from './entities/quota/quota-log.entity.js';
import { RecoRecommendation } from './entities/recommendation/recommendation.entity.js';
import { TelemetryEvent } from './entities/telemetry/telemetry-event.entity.js';
import { OutboxEvent } from './entities/outbox/outbox-event.entity.js';
import { IdempotencyKey } from './entities/idempotency/idempotency-key.entity.js';
import { AuditLog } from './entities/admin/audit-log.entity.js';

export const ALL_ENTITIES = [
  IamUser,
  IamSettings,
  IamWebhookEvent,
  AccountPurgeSaga,
  GdprPurgeLog,
  PendingToolResult,
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
  ConvRollingSummary,
  UserGoalMemory,
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
  AuditLog,
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
  providers: [DatabaseService],
  exports: [TypeOrmModule, DatabaseService],
})
export class DatabaseModule {}
