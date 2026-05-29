import { Body, Controller, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard.js';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator.js';
import { ApplyService } from './apply.service.js';

class GenerateFillPlanDto extends createZodDto(z.object({ radarItemId: z.string() })) {}

class RecordSubmissionDto extends createZodDto(
  z.object({
    radarItemId: z.string(),
    resumeSnapshotId: z.string().optional(),
  }),
) {}

@ApiTags('apply')
@ApiBearerAuth()
@UseGuards(ClerkAuthGuard)
@Controller('apply')
export class ApplyController {
  constructor(private readonly service: ApplyService) {}

  @Post('plan')
  @ApiOperation({ summary: 'Generate fill plan for LinkedIn Easy Apply' })
  async generatePlan(@CurrentUser() user: AuthenticatedUser, @Body() dto: GenerateFillPlanDto) {
    return this.service.generateFillPlan(user.userId, dto.radarItemId);
  }

  @Patch('plan/:id/approve')
  @ApiOperation({ summary: 'Approve fill plan' })
  async approvePlan(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.approvePlan(user.userId, id);
  }

  @Post('submit')
  @ApiOperation({ summary: 'Record user-submitted application' })
  async submit(@CurrentUser() user: AuthenticatedUser, @Body() dto: RecordSubmissionDto) {
    return this.service.recordSubmission(user.userId, dto.radarItemId, dto.resumeSnapshotId);
  }
}
