import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { MEMORY_QUEUE } from '../contexts/memory/memory.constants.js';
import { AgentService } from './agent.service.js';
import { ContextBuilderService } from './context-builder.service.js';
import { ConvMessageRepository } from './conv-message.repository.js';
import { SemanticMaterialLoaderService } from './semantic-material-loader.service.js';
import { ToolRegistry, TOOL_EXECUTORS, type ToolExecutor } from './tool-registry.js';
import { SearchCompanyTool } from './tools/search-company.tool.js';
import { MineShiningPointTool } from './tools/mine-shining-point.tool.js';
import { DraftMotivationTool } from './tools/draft-motivation.tool.js';
import { ClassifyEmailTool } from './tools/classify-email.tool.js';
import { DraftReplyTool } from './tools/draft-reply.tool.js';
import { SetConversationDensityTool } from './tools/set-conversation-density.tool.js';
import { FarewellTool } from './tools/farewell.tool.js';
import { RecomputeMatchTool } from './tools/recompute-match.tool.js';
import { JobMatchResult } from '../database/entities/jobs/match-result.entity.js';
import { ConvMessage } from '../database/entities/conversation/message.entity.js';
import { ConvConversation } from '../database/entities/conversation/conversation.entity.js';
import { ConvRollingSummary } from '../database/entities/conversation/rolling-summary.entity.js';
import { UserGoalMemory } from '../database/entities/memory/user-goal-memory.entity.js';
import { JobRadarItem } from '../database/entities/jobs/radar-item.entity.js';
import { ProfileProfile } from '../database/entities/profile/profile.entity.js';
import { ProfileMaterial } from '../database/entities/profile/material.entity.js';
import { JobCompanyBrief } from '../database/entities/jobs/company-brief.entity.js';
import { JobParsedJd } from '../database/entities/jobs/parsed-jd.entity.js';
import { FollowupEmail } from '../database/entities/followup/followup-email.entity.js';
import { FollowupDraft } from '../database/entities/followup/followup-draft.entity.js';
import { PendingToolResult } from '../database/entities/agent/pending-tool-result.entity.js';
import { TelemetryEvent } from '../database/entities/telemetry/telemetry-event.entity.js';
import { FIELD_CRYPTO } from '../common/crypto/crypto.interface.js';
import {
  QUINN_PROMPT_PROVIDER,
  defaultQuinnPromptProvider,
} from './prompts/quinn-prompt.provider.js';
import { EnvelopeCryptoService } from '../common/crypto/envelope-crypto.service.js';
import { EphemeralCryptoService } from '../common/crypto/ephemeral-crypto.service.js';
import { ConfigService } from '@nestjs/config';
import { type AppConfig } from '../config/configuration.js';
import { ValidatedJsonAgent } from './json-validator.service.js';
import { HybridRetrieverService } from './hybrid-retriever.service.js';
import { ParseFailureLog } from '../database/entities/agent/parse-failure-log.entity.js';

const TOOL_EXECUTORS_LIST = [
  SearchCompanyTool,
  MineShiningPointTool,
  DraftMotivationTool,
  ClassifyEmailTool,
  DraftReplyTool,
  SetConversationDensityTool,
  FarewellTool,
  RecomputeMatchTool,
];

@Module({
  imports: [
    BullModule.registerQueue({ name: MEMORY_QUEUE }),
    TypeOrmModule.forFeature([
      ConvMessage,
      ConvConversation,
      ConvRollingSummary,
      ProfileProfile,
      ProfileMaterial,
      JobCompanyBrief,
      JobParsedJd,
      JobRadarItem,
      JobMatchResult,
      FollowupEmail,
      FollowupDraft,
      UserGoalMemory,
      PendingToolResult,
      TelemetryEvent,
      ParseFailureLog,
    ]),
  ],
  providers: [
    {
      provide: FIELD_CRYPTO,
      inject: [ConfigService],
      useFactory: async (config: ConfigService<AppConfig>) => {
        const env = config.get('env', { infer: true });
        const service =
          env === 'production' ? new EnvelopeCryptoService(config) : new EphemeralCryptoService();
        await service.verify();
        return service;
      },
    },
    {
      provide: QUINN_PROMPT_PROVIDER,
      useValue: defaultQuinnPromptProvider,
    },
    ConvMessageRepository,
    AgentService,
    ValidatedJsonAgent,
    HybridRetrieverService,
    ContextBuilderService,
    SemanticMaterialLoaderService,

    ...TOOL_EXECUTORS_LIST,
    {
      provide: TOOL_EXECUTORS,
      useFactory: (...tools: ToolExecutor[]) => tools,
      inject: TOOL_EXECUTORS_LIST,
    },

    ToolRegistry,
  ],
  exports: [AgentService, ContextBuilderService, SearchCompanyTool],
})
export class AgentModule {}
