import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { FollowupController } from './followup.controller.js';
import { FollowupService } from './followup.service.js';
import { FollowupSchedulerService } from './followup-scheduler.service.js';
import { FollowupEmail } from '../../database/entities/followup/followup-email.entity.js';
import { FollowupDraft } from '../../database/entities/followup/followup-draft.entity.js';
import { JobRadarItem } from '../../database/entities/jobs/radar-item.entity.js';
import { GdprPurgeLog } from '../../database/entities/iam/gdpr-purge-log.entity.js';
import { IamUser } from '../../database/entities/iam/iam-user.entity.js';
import { AccountPurgeSaga } from '../../database/entities/iam/account-purge-saga.entity.js';
import { FIELD_CRYPTO } from '../../common/crypto/crypto.interface.js';
import { EnvelopeCryptoService } from '../../common/crypto/envelope-crypto.service.js';
import { EphemeralCryptoService } from '../../common/crypto/ephemeral-crypto.service.js';
import { type AppConfig } from '../../config/configuration.js';
import { IamModule } from '../iam/iam.module.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      FollowupEmail,
      FollowupDraft,
      JobRadarItem,
      GdprPurgeLog,
      IamUser,
      AccountPurgeSaga,
    ]),
    IamModule,
  ],
  controllers: [FollowupController],
  providers: [
    FollowupService,
    FollowupSchedulerService,
    {
      provide: FIELD_CRYPTO,
      inject: [ConfigService],
      useFactory: async (config: ConfigService<AppConfig>) => {
        const service = config.get('env', { infer: true }) === 'production'
          ? new EnvelopeCryptoService(config)
          : new EphemeralCryptoService();
        await service.verify();
        return service;
      },
    },
  ],
})
export class FollowupModule {}
