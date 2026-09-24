import { Body, Controller, Get, Header, Param, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Observable, map } from 'rxjs';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../common/decorators/current-user.decorator.js';
import { ConversationService } from './conversation.service.js';
import { AgentService } from '../../agent/agent.service.js';
import { MEMORY_QUEUE, type MemoryJobData } from '../memory/memory.constants.js';

class CreateConversationDto extends createZodDto(
  z.object({
    kind: z.enum([
      'FREE_CHAT',
      'ONBOARDING',
      'JOB_ANALYSIS',
      'GAP_MINING',
      'TAILOR_EDIT',
      'FOLLOWUP',
    ]),
    anchorId: z.string().optional(),
  }),
) {}

class SendPromptDto extends createZodDto(
  z.object({ message: z.string(), messageId: z.string().max(64).optional() }),
) {}

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

  @Get()
  @ApiOperation({ summary: 'List recent conversations, newest first' })
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.service.listByUser(user.userId);
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

  @Post(':id/prompt')
  @Header('Content-Type', 'text/event-stream')
  @Header('Cache-Control', 'no-cache, no-transform')
  @Header('Connection', 'keep-alive')
  @ApiOperation({ summary: 'Send a message — returns SSE stream of agent events' })
  async prompt(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: SendPromptDto,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    res.flushHeaders();
    const stream = this.agent.respond(
      id,
      user.userId,
      dto.message,
      undefined,
      undefined,
      dto.messageId,
    );
    const subscription = stream.subscribe({
      next: (evt) => res.write(`data: ${evt.data}\n\n`),
      error: () => res.end(),
      complete: () => res.end(),
    });
    req.once('close', () => subscription.unsubscribe());
  }
}
