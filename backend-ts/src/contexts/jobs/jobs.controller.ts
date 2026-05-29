import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard.js';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator.js';
import { JobsService } from './jobs.service.js';

class CaptureJobDto extends createZodDto(
  z.object({
    source: z.string(),
    sourceUrl: z.string(),
    sourceJobId: z.string().optional(),
    capturedHtml: z.string().optional(),
    capturedText: z.string().optional(),
  }),
) {}

class UpdateRadarDto extends createZodDto(
  z.object({
    status: z.enum([
      'BROWSED',
      'ANALYZED',
      'DECIDED',
      'DECIDED_NO',
      'APPLIED',
      'INTERVIEWING',
      'OFFER_RECEIVED',
      'OFFER_ACCEPTED',
      'OFFER_REJECTED',
      'REJECTED',
    ]),
    note: z.string().optional(),
  }),
) {}

@ApiTags('jobs')
@ApiBearerAuth()
@UseGuards(ClerkAuthGuard)
@Controller('jobs')
export class JobsController {
  constructor(private readonly service: JobsService) {}

  @Post('capture')
  @ApiOperation({ summary: 'Capture a job from content script' })
  async capture(@CurrentUser() user: AuthenticatedUser, @Body() dto: CaptureJobDto) {
    return this.service.captureJob(user.userId, dto);
  }

  @Get('radar')
  @ApiOperation({ summary: 'List radar (all tracked jobs)' })
  async radar(@CurrentUser() user: AuthenticatedUser) {
    return this.service.listRadar(user.userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get job with parsed JD + match result' })
  async get(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.getJob(user.userId, id);
  }

  @Patch(':id/radar')
  @ApiOperation({ summary: 'Update radar item status' })
  async updateRadar(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateRadarDto,
  ) {
    return this.service.updateRadarStatus(user.userId, id, dto.status, dto.note);
  }
}
