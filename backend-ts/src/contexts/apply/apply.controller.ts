import { Body, Controller, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { ApplyService } from './apply.service';

class GenerateFillPlanDto {
  @IsString() radarItemId: string;
}

class RecordSubmissionDto {
  @IsString() radarItemId: string;
  @IsOptional() @IsString() resumeSnapshotId?: string;
}

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
