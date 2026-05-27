import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { FollowupController } from './followup.controller';
import { FollowupService } from './followup.service';
import { FollowupEmail } from '../../database/entities/followup/followup-email.entity';
import { FollowupDraft } from '../../database/entities/followup/followup-draft.entity';
import { FIELD_CRYPTO } from '../../common/crypto/crypto.interface';
import { EnvelopeCryptoService } from '../../common/crypto/envelope-crypto.service';
import { EphemeralCryptoService } from '../../common/crypto/ephemeral-crypto.service';
import { AppConfig } from '../../config/configuration';

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
