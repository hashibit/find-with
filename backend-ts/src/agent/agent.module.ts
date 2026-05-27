import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AgentService } from './agent.service';
import { ContextBuilderService } from './context-builder.service';
import { SearchCompanyTool } from './tools/search-company.tool';
import { MineShiningPointTool } from './tools/mine-shining-point.tool';
import { DraftMotivationTool } from './tools/draft-motivation.tool';
import { ClassifyEmailTool } from './tools/classify-email.tool';
import { DraftReplyTool } from './tools/draft-reply.tool';
import { SetConversationDensityTool } from './tools/set-conversation-density.tool';
import { ConvMessage } from '../database/entities/conversation/message.entity';
import { ConvConversation } from '../database/entities/conversation/conversation.entity';
import { ProfileProfile } from '../database/entities/profile/profile.entity';
import { ProfileMaterial } from '../database/entities/profile/material.entity';
import { JobCompanyBrief } from '../database/entities/jobs/company-brief.entity';
import { JobParsedJd } from '../database/entities/jobs/parsed-jd.entity';
import { FollowupEmail } from '../database/entities/followup/followup-email.entity';
import { FollowupDraft } from '../database/entities/followup/followup-draft.entity';
import { FIELD_CRYPTO } from '../common/crypto/crypto.interface';
import { EnvelopeCryptoService } from '../common/crypto/envelope-crypto.service';
import { EphemeralCryptoService } from '../common/crypto/ephemeral-crypto.service';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../config/configuration';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ConvMessage,
      ConvConversation,
      ProfileProfile,
      ProfileMaterial,
      JobCompanyBrief,
      JobParsedJd,
      FollowupEmail,
      FollowupDraft,
    ]),
  ],
  providers: [
    {
      provide: FIELD_CRYPTO,
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig>) => {
        const env = config.get('env', { infer: true });
        return env === 'production' ? new EnvelopeCryptoService(config) : new EphemeralCryptoService();
      },
    },
    AgentService,
    ContextBuilderService,
    SearchCompanyTool,
    MineShiningPointTool,
    DraftMotivationTool,
    ClassifyEmailTool,
    DraftReplyTool,
    SetConversationDensityTool,
  ],
  exports: [AgentService],
})
export class AgentModule {}
