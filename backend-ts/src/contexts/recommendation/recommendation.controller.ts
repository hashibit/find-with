import { Body, Controller, Get, NotFoundException, Param, Post, HttpCode, Query, Res } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { type Response } from 'express';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CurrentUser, type AuthenticatedUser } from '../../common/decorators/current-user.decorator.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { RecommendationService } from './recommendation.service.js';
import { RecoRecommendation } from '../../database/entities/recommendation/recommendation.entity.js';

class BuildRecoDto extends createZodDto(
  z.object({ query: z.string().min(1) }),
) {}

class FeedbackDto extends createZodDto(
  z.object({ liked: z.boolean().optional(), reason: z.string().optional() }),
) {}

class TrackClickDto extends createZodDto(
  z.object({
    trackingId: z.string(),
    itemIndex: z.number().int().min(0),
  }),
) {}

@ApiTags('recommendations')
@ApiBearerAuth()
@Controller('recommendations')
export class RecommendationController {
  constructor(
    private readonly service: RecommendationService,
    @InjectRepository(RecoRecommendation) private readonly recoRepo: Repository<RecoRecommendation>,
  ) {}

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
   * In-app click tracker — JWT-authenticated, HMAC-signed.
   * 404 on invalid signature (don't reveal endpoint existence).
   */
  @Post(':id/click')
  @ApiOperation({ summary: 'Record a recommendation click (HMAC-signed, in-app)' })
  async recordClick(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') recoId: string,
    @Body() dto: TrackClickDto,
  ) {
    if (!this.service.verifyTrackingId(user.userId, recoId, dto.itemIndex, dto.trackingId)) {
      throw new NotFoundException();
    }
    await this.service.recordClick(user.userId, recoId);
    return { ok: true };
  }

  /**
   * Email click redirect — public, HMAC-signed, no open redirect.
   * URL is always fetched from DB (reco.items[i].url), never from query params.
   */
  @Get('r/:recoId')
  @Public()
  @ApiOperation({ summary: 'HMAC-signed email click redirect (no auth required)' })
  async redirectClick(
    @Param('recoId') recoId: string,
    @Query('t') trackingId: string,
    @Query('uid') userId: string,
    @Query('i') itemIndexStr: string,
    @Res() res: Response,
  ) {
    const FALLBACK = 'https://findwith.com';
    const i = parseInt(itemIndexStr, 10);
    if (!Number.isFinite(i) || i < 0) return res.redirect(302, FALLBACK);

    const reco = await this.recoRepo.findOne({ where: { id: recoId, userId } });
    const items = (reco?.items ?? []) as Array<{ url?: string }>;
    const url = items[i]?.url ?? FALLBACK;

    if (this.service.verifyTrackingId(userId, recoId, i, trackingId)) {
      await this.service.recordClick(userId, recoId);
    }
    return res.redirect(302, url);
  }
}
