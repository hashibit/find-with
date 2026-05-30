import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { ConversationController } from './conversation.controller.js';
import { ConversationService } from './conversation.service.js';
import { ConvConversation } from '../../database/entities/conversation/conversation.entity.js';
import { ConvMessage } from '../../database/entities/conversation/message.entity.js';
import { AgentModule } from '../../agent/agent.module.js';
import { MEMORY_QUEUE } from '../memory/memory.constants.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([ConvConversation, ConvMessage]),
    BullModule.registerQueue({ name: MEMORY_QUEUE }),
    AgentModule,
  ],
  controllers: [ConversationController],
  providers: [ConversationService],
  exports: [ConversationService],
})
export class ConversationModule {}
