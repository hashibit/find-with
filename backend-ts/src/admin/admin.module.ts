import { Module } from '@nestjs/common';
import AdminJS from 'adminjs';
import { AdminModule as AdminJSNestModule } from '@adminjs/nestjs';
import { Database, Resource } from '@adminjs/typeorm';
import { BullBoardModule } from '@bull-board/nestjs';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { BullModule } from '@nestjs/bullmq';
import { TypeOrmModule, getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import type { Repository } from 'typeorm';
import { timingSafeEqual } from 'crypto';
import type { Request, Response, NextFunction } from 'express';

import { type AppConfig } from '../config/configuration.js';
import { AdminGuard } from './admin.guard.js';
import { MetricsService } from './metrics/metrics.service.js';
import { MetricsController } from './metrics/metrics.controller.js';
import { HealthService } from './health/health.service.js';
import { HealthController } from './health/health.controller.js';

import { IamUser } from '../database/entities/iam/iam-user.entity.js';
import { BillingSubscription } from '../database/entities/billing/subscription.entity.js';
import { QuotaUsageCounter } from '../database/entities/quota/quota-counter.entity.js';
import { AccountPurgeSaga } from '../database/entities/iam/account-purge-saga.entity.js';
import { IamWebhookEvent } from '../database/entities/iam/webhook-event.entity.js';
import { OutboxEvent } from '../database/entities/outbox/outbox-event.entity.js';
import { TelemetryEvent } from '../database/entities/telemetry/telemetry-event.entity.js';
import { QuotaConsumeLog } from '../database/entities/quota/quota-log.entity.js';
import { AuditLog } from '../database/entities/admin/audit-log.entity.js';

import { buildUserResource } from './resources/user.resource.js';
import { buildSubscriptionResource } from './resources/subscription.resource.js';
import { buildQuotaResource } from './resources/quota.resource.js';
import { buildOutboxEventResource } from './resources/outbox-event.resource.js';
import { buildWebhookEventResource } from './resources/webhook-event.resource.js';
import { buildPurgeSagaResource } from './resources/purge-saga.resource.js';

import { MEMORY_QUEUE } from '../contexts/memory/memory.constants.js';
import { RESUME_PARSE_QUEUE } from '../contexts/profile/profile.service.js';
import { JOB_ANALYZE_QUEUE } from '../contexts/jobs/jobs.service.js';
import { TAILORING_QUEUE } from '../contexts/tailoring/tailoring.service.js';
import { AgentModule } from '../agent/agent.module.js';

AdminJS.registerAdapter({ Database, Resource });

@Module({
  imports: [
    TypeOrmModule.forFeature([
      IamUser,
      BillingSubscription,
      QuotaUsageCounter,
      AccountPurgeSaga,
      IamWebhookEvent,
      OutboxEvent,
      TelemetryEvent,
      QuotaConsumeLog,
      AuditLog,
    ]),
    BullModule.registerQueue(
      { name: MEMORY_QUEUE },
      { name: RESUME_PARSE_QUEUE },
      { name: JOB_ANALYZE_QUEUE },
      { name: TAILORING_QUEUE },
    ),
    AdminJSNestModule.createAdminAsync({
      imports: [TypeOrmModule.forFeature([
        IamUser, BillingSubscription, QuotaUsageCounter, OutboxEvent, IamWebhookEvent,
        AccountPurgeSaga, AuditLog,
      ])],
      inject: [
        ConfigService,
        getRepositoryToken(IamUser),
        getRepositoryToken(BillingSubscription),
        getRepositoryToken(QuotaUsageCounter),
        getRepositoryToken(OutboxEvent),
        getRepositoryToken(IamWebhookEvent),
        getRepositoryToken(AccountPurgeSaga),
        getRepositoryToken(AuditLog),
      ],
      useFactory: (
        configService: ConfigService<AppConfig>,
        userRepo: Repository<IamUser>,
        subscriptionRepo: Repository<BillingSubscription>,
        quotaRepo: Repository<QuotaUsageCounter>,
        outboxRepo: Repository<OutboxEvent>,
        webhookRepo: Repository<IamWebhookEvent>,
        sagaRepo: Repository<AccountPurgeSaga>,
        auditLogRepo: Repository<AuditLog>,
      ) => {
        const secret = configService.get('admin', { infer: true })!.secret;
        return {
          adminJsOptions: {
            rootPath: '/admin',
            resources: [
              buildUserResource(userRepo),
              buildSubscriptionResource(subscriptionRepo),
              buildQuotaResource(quotaRepo),
              buildOutboxEventResource(outboxRepo),
              buildWebhookEventResource(webhookRepo),
              buildPurgeSagaResource(sagaRepo, auditLogRepo),
            ],
          },
          auth: {
            authenticate: async (email: string, password: string) => {
              if (password === secret) {
                return Promise.resolve({ email: 'admin@findwith.com' });
              }
              return Promise.resolve(null);
            },
            cookieName: 'adminjs',
            cookiePassword: secret,
          },
          sessionOptions: {
            resave: false,
            saveUninitialized: true,
            secret,
          },
        };
      },
    }),
    BullBoardModule.forRoot({
      route: '/admin/queues',
      adapter: ExpressAdapter,
      middleware: (req: Request, res: Response, next: NextFunction) => {
        const configService = (req as unknown as { app: { get: (token: unknown) => unknown } }).app.get(ConfigService);
        const secret = (configService as ConfigService<AppConfig>).get('admin', { infer: true })!.secret;
        const provided = (req.headers['x-admin-secret'] as string) ?? '';
        let isValid = false;
        try {
          const a = Buffer.from(provided, 'utf8');
          const b = Buffer.from(secret, 'utf8');
          const len = Math.max(a.length, b.length);
          const pa = Buffer.alloc(len);
          const pb = Buffer.alloc(len);
          a.copy(pa);
          b.copy(pb);
          isValid = timingSafeEqual(pa, pb) && a.length === b.length;
        } catch {
          isValid = false;
        }
        if (!isValid) {
          res.status(401).json({ error: 'Unauthorized' });
          return;
        }
        next();
      },
    }),
    BullBoardModule.forFeature({ name: MEMORY_QUEUE, adapter: BullMQAdapter }),
    BullBoardModule.forFeature({ name: RESUME_PARSE_QUEUE, adapter: BullMQAdapter }),
    BullBoardModule.forFeature({ name: JOB_ANALYZE_QUEUE, adapter: BullMQAdapter }),
    BullBoardModule.forFeature({ name: TAILORING_QUEUE, adapter: BullMQAdapter }),
    AgentModule,
  ],
  providers: [
    AdminGuard,
    MetricsService,
    HealthService,
  ],
  controllers: [MetricsController, HealthController],
  exports: [AdminGuard, MetricsService, HealthService],
})
export class AdminModule {}
