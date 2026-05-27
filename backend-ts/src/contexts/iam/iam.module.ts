import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { IamController } from './iam.controller';
import { IamService } from './iam.service';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { IamUser } from '../../database/entities/iam/iam-user.entity';
import { IamSettings } from '../../database/entities/iam/iam-settings.entity';
import { BillingSubscription } from '../../database/entities/billing/subscription.entity';
import { QuotaUsageCounter } from '../../database/entities/quota/quota-counter.entity';
import { PAYMENT_GATEWAY } from '../../adapters/payment/payment.interface';
import { StripePaymentAdapter } from '../../adapters/payment/stripe-payment.adapter';
import { StubPaymentAdapter } from '../../adapters/payment/stub-payment.adapter';
import { AppConfig } from '../../config/configuration';
import { AUTH_VERIFIER } from '../../adapters/auth/auth.interface';
import { ClerkAuthAdapter } from '../../adapters/auth/clerk-auth.adapter';
import { DevAuthAdapter } from '../../adapters/auth/dev-auth.adapter';

@Module({
  imports: [
    TypeOrmModule.forFeature([IamUser, IamSettings, BillingSubscription, QuotaUsageCounter]),
  ],
  controllers: [IamController, BillingController],
  providers: [
    IamService,
    BillingService,
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
  exports: [IamService, AUTH_VERIFIER, PAYMENT_GATEWAY],
})
export class IamModule {}
