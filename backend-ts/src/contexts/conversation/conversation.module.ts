import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConversationController } from './conversation.controller.js';
import { ConversationService } from './conversation.service.js';
import { ConvConversation } from '../../database/entities/conversation/conversation.entity.js';
import { ConvMessage } from '../../database/entities/conversation/message.entity.js';
import { AgentModule } from '../../agent/agent.module.js';

@Module({
  imports: [TypeOrmModule.forFeature([ConvConversation, ConvMessage]), AgentModule],
  controllers: [ConversationController],
  providers: [ConversationService],
  exports: [ConversationService],
})
export class ConversationModule {}
