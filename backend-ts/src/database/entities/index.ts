// Single source of truth for the entity list. Consumed by both the NestJS
// runtime (database.module.ts) and the TypeORM CLI (data-source.ts).
// Keep this file side-effect free — imports + the array only.
import { IamUser } from './iam/iam-user.entity.js';
import { IamSettings } from './iam/iam-settings.entity.js';
import { IamWebhookEvent } from './iam/webhook-event.entity.js';
import { AccountPurgeSaga } from './iam/account-purge-saga.entity.js';
import { GdprPurgeLog } from './iam/gdpr-purge-log.entity.js';
import { PendingToolResult } from './agent/pending-tool-result.entity.js';
import { ProfileResumeSource } from './profile/resume-source.entity.js';
import { ProfileProfile } from './profile/profile.entity.js';
import { ProfileEducation } from './profile/education.entity.js';
import { ProfileWorkExperience } from './profile/work-experience.entity.js';
import { ProfileProject } from './profile/project.entity.js';
import { ProfileSkill } from './profile/skill.entity.js';
import { ProfileMaterial } from './profile/material.entity.js';
import { ProfileBaseResume } from './profile/base-resume.entity.js';
import { JobCapture } from './jobs/job-capture.entity.js';
import { JobParsedJd } from './jobs/parsed-jd.entity.js';
import { JobCompanyBrief } from './jobs/company-brief.entity.js';
import { JobMatchResult } from './jobs/match-result.entity.js';
import { JobRadarItem } from './jobs/radar-item.entity.js';
import { ConvConversation } from './conversation/conversation.entity.js';
import { ConvMessage } from './conversation/message.entity.js';
import { ConvToolCall } from './conversation/tool-call.entity.js';
import { ConvRollingSummary } from './conversation/rolling-summary.entity.js';
import { UserGoalMemory } from './memory/user-goal-memory.entity.js';
import { TailoringResume } from './tailoring/tailoring-resume.entity.js';
import { TailoringBullet } from './tailoring/tailoring-bullet.entity.js';
import { TailoringSnapshot } from './tailoring/tailoring-snapshot.entity.js';
import { ApplyFillPlan } from './apply/fill-plan.entity.js';
import { ApplyApplication } from './apply/application.entity.js';
import { FollowupEmail } from './followup/followup-email.entity.js';
import { FollowupDraft } from './followup/followup-draft.entity.js';
import { BillingSubscription } from './billing/subscription.entity.js';
import { QuotaUsageCounter } from './quota/quota-counter.entity.js';
import { QuotaConsumeLog } from './quota/quota-log.entity.js';
import { RecoRecommendation } from './recommendation/recommendation.entity.js';
import { TelemetryEvent } from './telemetry/telemetry-event.entity.js';
import { OutboxEvent } from './outbox/outbox-event.entity.js';
import { IdempotencyKey } from './idempotency/idempotency-key.entity.js';
import { AuditLog } from './admin/audit-log.entity.js';
import { ParseFailureLog } from './agent/parse-failure-log.entity.js';
import { TokenUsageLog } from './telemetry/token-usage-log.entity.js';
import { GuardrailLog } from '../../common/guardrails/guardrail-log.entity.js';

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
  ConvToolCall,
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
