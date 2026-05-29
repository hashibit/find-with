import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard.js';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator.js';
import { FollowupService } from './followup.service.js';

class CaptureEmailDto extends createZodDto(
  z.object({
    subject: z.string().optional(),
    fromAddr: z.string().optional(),
    bodyText: z.string().optional(),
    radarItemId: z.string().optional(),
  }),
) {}

@ApiTags('followup')
@ApiBearerAuth()
@UseGuards(ClerkAuthGuard)
@Controller('followup')
export class FollowupController {
  constructor(private readonly service: FollowupService) {}

  @Post('emails')
  @ApiOperation({ summary: 'Capture an email from content script' })
  async captureEmail(@CurrentUser() user: AuthenticatedUser, @Body() dto: CaptureEmailDto) {
    return this.service.captureEmail(user.userId, dto);
  }

  @Get('emails')
  @ApiOperation({ summary: 'List captured emails' })
  async listEmails(@CurrentUser() user: AuthenticatedUser) {
    return this.service.listEmails(user.userId);
  }

  @Get('drafts')
  @ApiOperation({ summary: 'List email drafts' })
  async listDrafts(@CurrentUser() user: AuthenticatedUser) {
    return this.service.listDrafts(user.userId);
  }
}
