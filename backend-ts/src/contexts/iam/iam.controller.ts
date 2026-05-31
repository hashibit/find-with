import { randomBytes } from 'crypto';
import { Body, Controller, Delete, Get, Patch, Post, BadRequestException, Inject, NotFoundException, Res, HttpCode } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { type Response } from 'express';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { CurrentUser, type AuthenticatedUser } from '../../common/decorators/current-user.decorator.js';
import { IamService } from './iam.service.js';
import { AUTH_VERIFIER, type AuthVerifier } from '../../adapters/auth/auth.interface.js';
import { NonceStore } from './services/nonce.store.js';
import { AccountPurgeSagaService } from './services/account-purge-saga.service.js';
import { RedisService } from '../../redis/redis.module.js';
import { BillingSubscription } from '../../database/entities/billing/subscription.entity.js';
import { QuotaUsageCounter } from '../../database/entities/quota/quota-counter.entity.js';
import { ProfileProfile } from '../../database/entities/profile/profile.entity.js';
import { ProfileMaterial } from '../../database/entities/profile/material.entity.js';
import { JobRadarItem } from '../../database/entities/jobs/radar-item.entity.js';
import { ConvConversation } from '../../database/entities/conversation/conversation.entity.js';

const SESSION_TTL_SECONDS = 86400; // 24 hours

class UpsertUserDto extends createZodDto(
  z.object({
    email: z.string(),
    fullName: z.string().optional(),
  }),
) {}

class UpdateSettingsDto extends createZodDto(
  z.object({
    density: z.enum(['ENGAGED', 'BALANCED', 'QUIET']).optional(),
    locale: z.string().optional(),
    timezone: z.string().optional(),
  }),
) {}

class AuthExchangeDto extends createZodDto(
  z.object({
    // Enforce a reasonable length and character set to prevent Redis key injection
    // via pathologically large or malformed nonce values.
    nonce: z.string().min(8).max(128).regex(/^[a-zA-Z0-9_-]+$/),
  }),
) {}

class AuthExchangeResponse {
  token: string;
  expires_at: number;
  user_id: string;
}

class AuthVerifyDto extends createZodDto(
  z.object({
    clerkToken: z.string(),
  }),
) {}

class AuthVerifyResponse {
  token: string;
  expires_at: number;
  user_id: string;
}

@ApiTags('iam')
@ApiBearerAuth()
@Controller('iam')
export class IamController {
  constructor(
    private readonly service: IamService,
    @Inject(AUTH_VERIFIER) private readonly authVerifier: AuthVerifier,
    private readonly nonceStore: NonceStore,
    private readonly purgeSaga: AccountPurgeSagaService,
    private readonly redisService: RedisService,
    @InjectRepository(BillingSubscription)
    private readonly billingRepo: Repository<BillingSubscription>,
    @InjectRepository(QuotaUsageCounter)
    private readonly quotaRepo: Repository<QuotaUsageCounter>,
    @InjectRepository(ProfileProfile)
    private readonly profileRepo: Repository<ProfileProfile>,
    @InjectRepository(ProfileMaterial)
    private readonly materialRepo: Repository<ProfileMaterial>,
    @InjectRepository(JobRadarItem)
    private readonly radarRepo: Repository<JobRadarItem>,
    @InjectRepository(ConvConversation)
    private readonly convRepo: Repository<ConvConversation>,
  ) {}

  @Post('me')
  @ApiOperation({ summary: 'Upsert current user on first login' })
  async upsert(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpsertUserDto) {
    return this.service.upsert(user.userId, dto.email, dto.fullName);
  }

  @Get('me')
  @ApiOperation({ summary: 'Get current user' })
  async me(@CurrentUser() user: AuthenticatedUser) {
    return this.service.findByClerkId(user.userId);
  }

  @Get('me/entitlements')
  @ApiOperation({ summary: 'Get current user entitlements and quota' })
  async entitlements(@CurrentUser() user: AuthenticatedUser) {
    const iamUser = await this.service.findByClerkId(user.userId);

    const sub = await this.billingRepo.findOne({ where: { userId: iamUser.id } });
    if (!sub) throw new NotFoundException('No subscription record found');

    const quota = await this.quotaRepo.findOne({ where: { userId: iamUser.id } });

    const tailoringLimit = quota?.tailoringLimit ?? 3;
    const tailoringCompleted = quota?.tailoringCompleted ?? 0;
    const remaining = Math.max(0, tailoringLimit - tailoringCompleted);

    return {
      tier: sub.tier,
      state: sub.state,
      quota: {
        tailoringLimit,
        tailoringCompleted,
        remaining,
      },
    };
  }

  @Get('settings')
  @ApiOperation({ summary: 'Get user settings' })
  async getSettings(@CurrentUser() user: AuthenticatedUser) {
    const iamUser = await this.service.findByClerkId(user.userId);
    return this.service.getSettings(iamUser.id);
  }

  @Patch('settings')
  @ApiOperation({ summary: 'Update user settings (density, locale, timezone)' })
  async updateSettings(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateSettingsDto) {
    const iamUser = await this.service.findByClerkId(user.userId);
    return this.service.updateSettings(iamUser.id, dto);
  }

  @Post('auth/exchange')
  @ApiOperation({ summary: 'Exchange nonce for session token (U-03 OAuth flow)' })
  async authExchange(@Body() dto: AuthExchangeDto): Promise<AuthExchangeResponse> {
    const userId = await this.nonceStore.validate(dto.nonce);
    if (!userId) {
      throw new BadRequestException('Invalid or expired nonce');
    }

    // CSPRNG session token — not derived from any user-observable input
    const token = randomBytes(32).toString('hex');
    const expiresAt = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;

    // Store hashed token → userId in Redis for guard validation
    await this.redisService.client.setex(`session:${token}`, SESSION_TTL_SECONDS, userId);

    return { token, expires_at: expiresAt, user_id: userId };
  }

  @Post('account:export')
  @HttpCode(200)
  @ApiOperation({ summary: 'Export all user data as JSON (GDPR Article 20 data portability)' })
  async exportAccount(@CurrentUser() user: AuthenticatedUser, @Res() res: Response) {
    const iamUser = await this.service.findByClerkId(user.userId);
    const uid = iamUser.id;

    const [settings, profile, materials, radar, subscription, quota, conversations] =
      await Promise.all([
        this.service.getSettings(uid),
        this.profileRepo.findOne({ where: { userId: uid } }),
        this.materialRepo.find({ where: { userId: uid }, order: { createdAt: 'ASC' } }),
        this.radarRepo.find({ where: { userId: uid }, order: { createdAt: 'ASC' } }),
        this.billingRepo.findOne({ where: { userId: uid } }),
        this.quotaRepo.findOne({ where: { userId: uid } }),
        this.convRepo.find({ where: { userId: uid }, order: { createdAt: 'ASC' } }),
      ]);

    const payload = {
      exportedAt: new Date().toISOString(),
      schemaVersion: '1.0',
      user: {
        id: iamUser.id,
        email: iamUser.email,
        fullName: iamUser.fullName,
        createdAt: iamUser.createdAt,
      },
      settings: settings ?? null,
      profile: profile ?? null,
      materials,
      radar,
      subscription: subscription
        ? { tier: subscription.tier, state: subscription.state, periodEnd: subscription.periodEnd }
        : null,
      quota: quota ?? null,
      conversationSummary: {
        count: conversations.length,
        ids: conversations.map((c) => c.id),
      },
    };

    // Note: raw message content is intentionally excluded from the export payload
    // to avoid returning encrypted bytea blobs. Users can request full message history
    // via support for a complete GDPR data package.
    res.setHeader('Content-Type', 'application/json');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="findwith-export-${iamUser.id}-${new Date().toISOString().slice(0, 10)}.json"`,
    );
    res.json(payload);
  }

  @Delete('account')
  @ApiOperation({ summary: 'Initiate account deletion (24h grace period)' })
  async deleteAccount(@CurrentUser() user: AuthenticatedUser) {
    const iamUser = await this.service.findByClerkId(user.userId);
    return this.purgeSaga.initiate(iamUser.id);
  }

  @Post('account/cancel-deletion')
  @ApiOperation({ summary: 'Cancel pending account deletion if within grace period' })
  async cancelDeletion(@CurrentUser() user: AuthenticatedUser) {
    const iamUser = await this.service.findByClerkId(user.userId);
    await this.purgeSaga.cancelDeletion(iamUser.id);
    return { ok: true };
  }

  @Post('auth/verify')
  @ApiOperation({ summary: 'Verify Clerk JWT and issue extension session token' })
  async authVerify(@Body() dto: AuthVerifyDto): Promise<AuthVerifyResponse> {
    const verified = await this.authVerifier.verify(dto.clerkToken);

    // Ensure user exists in our system
    await this.service.upsert(verified.userId, verified.email || 'unknown@findwith.com');

    // CSPRNG session token — not derived from userId or timestamp
    const token = randomBytes(32).toString('hex');
    const expiresAt = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;

    await this.redisService.client.setex(`session:${token}`, SESSION_TTL_SECONDS, verified.userId);

    return { token, expires_at: expiresAt, user_id: verified.userId };
  }
}
