import { Body, Controller, Get, NotFoundException, Param, Post, HttpCode } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { CurrentUser, type AuthenticatedUser } from '../../common/decorators/current-user.decorator.js';
import { RecommendationService } from './recommendation.service.js';

class BuildRecoDto extends createZodDto(
  z.object({ query: z.string().min(1) }),
) {}

class FeedbackDto extends createZodDto(
  z.object({ liked: z.boolean().optional(), reason: z.string().optional() }),
) {}

class TrackClickDto extends createZodDto(
  z.object({
    trackingId: z.string(),
    redirectUrl: z.string().url(),
  }),
) {}

@ApiTags('recommendations')
@ApiBearerAuth()
@Controller('recommendations')
export class RecommendationController {
  constructor(private readonly service: RecommendationService) {}

  @Get()
  @ApiOperation({ summary: 'List recent recommendations for current user' })
  async list(@CurrentUser() user: AuthenticatedUser) {
    return this.service.listRecommendations(user.userId);
  }

  @Post('build')
  @ApiOperation({ summary: 'Trigger daily recommendation build (Pro Plus)' })
  async build(@CurrentUser() user: AuthenticatedUser, @Body() dto: BuildRecoDto) {
    return this.service.buildDailyRecommendations(user.userId, dto.query);
  }

  @Post(':id/feedback')
  @HttpCode(204)
  @ApiOperation({ summary: 'Record like/dislike feedback on a recommendation' })
  async feedback(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: FeedbackDto,
  ) {
    await this.service.recordFeedback(user.userId, id, { liked: dto.liked, reason: dto.reason });
  }

  /**
   * HMAC-signed click tracker (U-08).
   * trackingId = HMAC(secret, userId:recoId:day). 404 on invalid signature.
   * Duplicate clicks per (userId, recoId) per day are ignored.
   */
  @Post(':id/click')
  @ApiOperation({ summary: 'Record a recommendation click (HMAC-signed, U-08)' })
  async recordClick(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') recoId: string,
    @Body() dto: TrackClickDto,
  ) {
    const valid = this.service.verifyTrackingId(user.userId, recoId, dto.trackingId);
    if (!valid) {
      // 404, not 403 — don't reveal the endpoint to unsigned requests
      throw new NotFoundException();
    }

    await this.service.recordClick(user.userId, recoId);
    return { ok: true, redirectUrl: dto.redirectUrl };
  }
}
