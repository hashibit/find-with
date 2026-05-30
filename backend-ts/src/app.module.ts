import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { UserAuthGuard } from './common/guards/user-auth.guard.js';
import { BullModule } from '@nestjs/bullmq';
import { LoggerModule } from 'nestjs-pino';
import { ThrottlerModule } from '@nestjs/throttler';
import { AppConfigModule } from './config/config.module.js';
import { DatabaseModule } from './database/database.module.js';
import { RedisModule } from './redis/redis.module.js';
import { LlmModule } from './llm/llm.module.js';
import { QuotaModule } from './contexts/quota/quota.module.js';
import { IamModule } from './contexts/iam/iam.module.js';
import { ProfileModule } from './contexts/profile/profile.module.js';
import { JobsModule } from './contexts/jobs/jobs.module.js';
import { ConversationModule } from './contexts/conversation/conversation.module.js';
import { TailoringModule } from './contexts/tailoring/tailoring.module.js';
import { ApplyModule } from './contexts/apply/apply.module.js';
import { FollowupModule } from './contexts/followup/followup.module.js';
import { RecommendationModule } from './contexts/recommendation/recommendation.module.js';
import { InfraModule } from './contexts/infra/infra.module.js';
import { MemoryModule } from './contexts/memory/memory.module.js';
import { type AppConfig } from './config/configuration.js';

@Module({
  imports: [
    AppConfigModule,
    DatabaseModule,
    RedisModule,
    LlmModule,
    LoggerModule.forRoot({
      pinoHttp: {
        transport: process.env.NODE_ENV !== 'production' ? { target: 'pino-pretty' } : undefined,
        level: process.env.NODE_ENV !== 'production' ? 'debug' : 'info',
      },
    }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: () => [{ ttl: 60_000, limit: 100 }],
    }),
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig>) => ({
        connection: { url: config.get('redis', { infer: true })!.url },
      }),
    }),
    QuotaModule,
    IamModule,
    ProfileModule,
    JobsModule,
    ConversationModule,
    TailoringModule,
    ApplyModule,
    FollowupModule,
    RecommendationModule,
    InfraModule,
    MemoryModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: UserAuthGuard }],
})
export class AppModule {}
