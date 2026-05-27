import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConversationController } from './conversation.controller';
import { ConversationService } from './conversation.service';
import { ConvConversation } from '../../database/entities/conversation/conversation.entity';
import { ConvMessage } from '../../database/entities/conversation/message.entity';
import { AgentModule } from '../../agent/agent.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ConvConversation, ConvMessage]),
    AgentModule,
  ],
  controllers: [ConversationController],
  providers: [ConversationService],
  exports: [ConversationService],
})
export class ConversationModule {}
