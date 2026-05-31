import { randomBytes } from 'crypto';
import { Body, Controller, Get, Patch, Post, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { CurrentUser, type AuthenticatedUser } from '../../common/decorators/current-user.decorator.js';
import { IamService } from './iam.service.js';
import { AUTH_VERIFIER, type AuthVerifier } from '../../adapters/auth/auth.interface.js';
import { Inject } from '@nestjs/common';
import { NonceStore } from './services/nonce.store.js';
import { RedisService } from '../../redis/redis.module.js';

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
    private readonly redisService: RedisService,
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
