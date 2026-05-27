import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { LoggerModule } from 'nestjs-pino';
import { ThrottlerModule } from '@nestjs/throttler';
import { AppConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { RedisModule } from './redis/redis.module';
import { LlmModule } from './llm/llm.module';
import { QuotaModule } from './contexts/quota/quota.module';
import { IamModule } from './contexts/iam/iam.module';
import { ProfileModule } from './contexts/profile/profile.module';
import { JobsModule } from './contexts/jobs/jobs.module';
import { ConversationModule } from './contexts/conversation/conversation.module';
import { TailoringModule } from './contexts/tailoring/tailoring.module';
import { ApplyModule } from './contexts/apply/apply.module';
import { FollowupModule } from './contexts/followup/followup.module';
import { RecommendationModule } from './contexts/recommendation/recommendation.module';
import { InfraModule } from './contexts/infra/infra.module';
import { AppConfig } from './config/configuration';

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
  ],
})
export class AppModule {}
