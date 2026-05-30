import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';

import { ConvMessage } from '../../database/entities/conversation/message.entity.js';
import { ConvRollingSummary } from '../../database/entities/conversation/rolling-summary.entity.js';
import { ProfileMaterial } from '../../database/entities/profile/material.entity.js';
import { UserGoalMemory } from '../../database/entities/memory/user-goal-memory.entity.js';
import { AgentModule } from '../../agent/agent.module.js';
import { LlmModule } from '../../llm/llm.module.js';
import { MemoryProcessor } from './memory.processor.js';
import { MEMORY_QUEUE } from './memory.constants.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([ConvMessage, ConvRollingSummary, ProfileMaterial, UserGoalMemory]),
    BullModule.registerQueue({ name: MEMORY_QUEUE }),
    AgentModule,
    LlmModule,
  ],
  providers: [MemoryProcessor],
})
export class MemoryModule {}
