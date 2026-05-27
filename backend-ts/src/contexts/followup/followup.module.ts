import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { FollowupController } from './followup.controller.js';
import { FollowupService } from './followup.service.js';
import { FollowupEmail } from '../../database/entities/followup/followup-email.entity.js';
import { FollowupDraft } from '../../database/entities/followup/followup-draft.entity.js';
import { FIELD_CRYPTO } from '../../common/crypto/crypto.interface.js';
import { EnvelopeCryptoService } from '../../common/crypto/envelope-crypto.service.js';
import { EphemeralCryptoService } from '../../common/crypto/ephemeral-crypto.service.js';
import { AppConfig } from '../../config/configuration.js';

@Module({
  imports: [TypeOrmModule.forFeature([FollowupEmail, FollowupDraft])],
  controllers: [FollowupController],
  providers: [
    FollowupService,
    {
      provide: FIELD_CRYPTO,
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig>) =>
        config.get('env', { infer: true }) === 'production'
          ? new EnvelopeCryptoService(config)
          : new EphemeralCryptoService(),
    },
  ],
})
export class FollowupModule {}
