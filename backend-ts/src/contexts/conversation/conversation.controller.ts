import { Body, Controller, Get, MessageEvent, Param, Post, Sse, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Observable, map } from 'rxjs';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard.js';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator.js';
import { ConversationService } from './conversation.service.js';
import { AgentService } from '../../agent/agent.service.js';

class CreateConversationDto extends createZodDto(
  z.object({
    kind: z.enum(['FREE_CHAT', 'ONBOARDING', 'JOB_ANALYSIS', 'GAP_MINING', 'TAILOR_EDIT', 'FOLLOWUP']),
    anchorId: z.string().optional(),
  }),
) {}

class SendPromptDto extends createZodDto(z.object({ message: z.string() })) {}

@ApiTags('conversation')
@ApiBearerAuth()
@UseGuards(ClerkAuthGuard)
@Controller('conversations')
export class ConversationController {
  constructor(
    private readonly service: ConversationService,
    private readonly agent: AgentService,
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

  @Sse(':id/prompt')
  @ApiOperation({ summary: 'Send a message — returns SSE stream of agent events' })
  prompt(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: SendPromptDto,
  ): Observable<MessageEvent> {
    return this.agent
      .respond(id, user.userId, dto.message)
      .pipe(map((evt) => ({ data: evt.data }) as MessageEvent));
  }
}
