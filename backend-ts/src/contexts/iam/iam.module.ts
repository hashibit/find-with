import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { IamController } from './iam.controller.js';
import { IamService } from './iam.service.js';
import { BillingController } from './billing.controller.js';
import { BillingService } from './billing.service.js';
import { IamUser } from '../../database/entities/iam/iam-user.entity.js';
import { IamSettings } from '../../database/entities/iam/iam-settings.entity.js';
import { IamWebhookEvent } from '../../database/entities/iam/webhook-event.entity.js';
import { BillingSubscription } from '../../database/entities/billing/subscription.entity.js';
import { QuotaUsageCounter } from '../../database/entities/quota/quota-counter.entity.js';
import { PAYMENT_GATEWAY } from '../../adapters/payment/payment.interface.js';
import { StripePaymentAdapter } from '../../adapters/payment/stripe-payment.adapter.js';
import { StubPaymentAdapter } from '../../adapters/payment/stub-payment.adapter.js';
import { type AppConfig } from '../../config/configuration.js';
import { AUTH_VERIFIER } from '../../adapters/auth/auth.interface.js';
import { ClerkAuthAdapter } from '../../adapters/auth/clerk-auth.adapter.js';
import { DevAuthAdapter } from '../../adapters/auth/dev-auth.adapter.js';
import { NonceStore } from './services/nonce.store.js';
import { AccountPurgeSagaService } from './services/account-purge-saga.service.js';
import { AccountPurgeSaga } from '../../database/entities/iam/account-purge-saga.entity.js';
import { RedisModule } from '../../redis/redis.module.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([IamUser, IamSettings, IamWebhookEvent, AccountPurgeSaga, BillingSubscription, QuotaUsageCounter]),
    RedisModule,
  ],
  controllers: [IamController, BillingController],
  providers: [
    IamService,
    BillingService,
    NonceStore,
    AccountPurgeSagaService,
    {
      provide: AUTH_VERIFIER,
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig>) => {
        const env = config.get('env', { infer: true });
        return env === 'production' ? new ClerkAuthAdapter(config) : new DevAuthAdapter();
      },
    },
    {
      provide: PAYMENT_GATEWAY,
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig>) => {
        const env = config.get('env', { infer: true });
        return env === 'production' ? new StripePaymentAdapter(config) : new StubPaymentAdapter();
      },
    },
  ],
  exports: [IamService, BillingService, AUTH_VERIFIER, PAYMENT_GATEWAY, NonceStore],
})
export class IamModule {}
