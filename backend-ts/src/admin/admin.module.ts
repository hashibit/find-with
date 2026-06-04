import { Module } from '@nestjs/common';
import { BullBoardModule } from '@bull-board/nestjs';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { BullModule } from '@nestjs/bullmq';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
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

import { MEMORY_QUEUE } from '../contexts/memory/memory.constants.js';
import { RESUME_PARSE_QUEUE } from '../contexts/profile/profile.service.js';
import { JOB_ANALYZE_QUEUE } from '../contexts/jobs/jobs.service.js';
import { TAILORING_QUEUE } from '../contexts/tailoring/tailoring.service.js';
import { AgentModule } from '../agent/agent.module.js';

import { UsersAdminController } from './ops/users.controller.js';
import { SubscriptionsAdminController } from './ops/subscriptions.controller.js';
import { QuotaAdminController } from './ops/quota.controller.js';
import { PurgeSagasAdminController } from './ops/purge-sagas.controller.js';
import { OutboxAdminController } from './ops/outbox.controller.js';
import { WebhooksAdminController } from './ops/webhooks.controller.js';
import { AuditLogsAdminController } from './ops/audit-logs.controller.js';

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
    BullBoardModule.forRootAsync({
      imports: [],
      inject: [ConfigService],
      useFactory: (configService: ConfigService<AppConfig>) => {
        const secret = configService.get('admin', { infer: true })!.secret;
        return {
          route: '/admin/queues',
          adapter: ExpressAdapter,
          middleware: (req: Request, res: Response, next: NextFunction) => {
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
        };
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
  controllers: [
    MetricsController,
    HealthController,
    UsersAdminController,
    SubscriptionsAdminController,
    QuotaAdminController,
    PurgeSagasAdminController,
    OutboxAdminController,
    WebhooksAdminController,
    AuditLogsAdminController,
  ],
  exports: [AdminGuard, MetricsService, HealthService],
})
export class AdminModule {}
