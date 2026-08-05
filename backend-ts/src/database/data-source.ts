import 'reflect-metadata';
import { config } from 'dotenv';
import { DataSource } from 'typeorm';

// Direct entity imports for TypeORM CLI (no NestJS dependencies)
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
import { TailoringBullet } from './entities/tailoring/tailoring-bullet.entity.js';
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
import { ParseFailureLog } from './entities/agent/parse-failure-log.entity.js';
import { TokenUsageLog } from './entities/telemetry/token-usage-log.entity.js';
import { GuardrailLog } from '../common/guardrails/guardrail-log.entity.js';

const ALL_ENTITIES = [
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
  TailoringBullet,
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
  ParseFailureLog,
  TokenUsageLog,
  GuardrailLog,
];

// Used by TypeORM CLI for migrations
// Only load .env if DATABASE_URL is not already set (e.g., by E2E setup)
if (!process.env.DATABASE_URL) {
  config();
}

// tsx runs .ts files directly, no need for compiled .js paths
export const AppDataSource = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  entities: ALL_ENTITIES,
  migrations: ['src/database/migrations/*.ts'],
  synchronize: false,
});
