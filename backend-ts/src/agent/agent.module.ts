import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AgentService } from './agent.service.js';
import { ContextBuilderService } from './context-builder.service.js';
import { SearchCompanyTool } from './tools/search-company.tool.js';
import { MineShiningPointTool } from './tools/mine-shining-point.tool.js';
import { DraftMotivationTool } from './tools/draft-motivation.tool.js';
import { ClassifyEmailTool } from './tools/classify-email.tool.js';
import { DraftReplyTool } from './tools/draft-reply.tool.js';
import { SetConversationDensityTool } from './tools/set-conversation-density.tool.js';
import { ConvMessage } from '../database/entities/conversation/message.entity.js';
import { ConvConversation } from '../database/entities/conversation/conversation.entity.js';
import { ProfileProfile } from '../database/entities/profile/profile.entity.js';
import { ProfileMaterial } from '../database/entities/profile/material.entity.js';
import { JobCompanyBrief } from '../database/entities/jobs/company-brief.entity.js';
import { JobParsedJd } from '../database/entities/jobs/parsed-jd.entity.js';
import { FollowupEmail } from '../database/entities/followup/followup-email.entity.js';
import { FollowupDraft } from '../database/entities/followup/followup-draft.entity.js';
import { FIELD_CRYPTO } from '../common/crypto/crypto.interface.js';
import { EnvelopeCryptoService } from '../common/crypto/envelope-crypto.service.js';
import { EphemeralCryptoService } from '../common/crypto/ephemeral-crypto.service.js';
import { ConfigService } from '@nestjs/config';
import { type AppConfig } from '../config/configuration.js';

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
        return env === 'production'
          ? new EnvelopeCryptoService(config)
          : new EphemeralCryptoService();
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
