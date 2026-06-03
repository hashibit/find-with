import { Body, Controller, Get, type MessageEvent, Param, Post, Query, Sse, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Observable, map } from 'rxjs';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { CurrentUser, type AuthenticatedUser } from '../../common/decorators/current-user.decorator.js';
import { ConversationService } from './conversation.service.js';
import { AgentService } from '../../agent/agent.service.js';
import { MEMORY_QUEUE, type MemoryJobData } from '../memory/memory.constants.js';

class CreateConversationDto extends createZodDto(
  z.object({
    kind: z.enum(['FREE_CHAT', 'ONBOARDING', 'JOB_ANALYSIS', 'GAP_MINING', 'TAILOR_EDIT', 'FOLLOWUP']),
    anchorId: z.string().optional(),
  }),
) {}

class SendPromptDto extends createZodDto(z.object({ message: z.string() })) {}

@ApiTags('conversation')
@ApiBearerAuth()
@Controller('conversations')
export class ConversationController {
  constructor(
    private readonly service: ConversationService,
    private readonly agent: AgentService,
    @InjectQueue(MEMORY_QUEUE) private readonly memoryQueue: Queue<MemoryJobData>,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create a new conversation' })
  async create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateConversationDto) {
    return this.service.create(user.userId, dto.kind, dto.anchorId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get conversation with messages' })
  async get(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.findOne(user.userId, id);
  }

  @Post(':id/close')
  @ApiOperation({ summary: 'Close a conversation — triggers preference extraction' })
  async close(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    const conv = await this.service.close(user.userId, id);
    await this.memoryQueue.add('extract', {
      type: 'EXTRACT_PREFERENCES',
      conversationId: id,
      userId: conv.userId,
    });
    return { ok: true };
  }

  @Sse(':id/prompt')
  @ApiOperation({ summary: 'Send a message — returns SSE stream of agent events' })
  prompt(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query('message') message: string,
  ): Observable<MessageEvent> {
    return this.agent
      .respond(id, user.userId, message)
      .pipe(map((evt) => ({ data: evt.data }) as MessageEvent));
  }
}
