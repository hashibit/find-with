import { Body, Controller, Get, Patch, Post, UseGuards, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { CurrentUser, type AuthenticatedUser } from '../../common/decorators/current-user.decorator.js';
import { IamService } from './iam.service.js';
import { AUTH_VERIFIER, type AuthVerifier, type VerifiedToken } from '../../adapters/auth/auth.interface.js';
import { Inject } from '@nestjs/common';
import { NonceStore } from './services/nonce.store.js';

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
    nonce: z.string(),
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
    // Validate nonce using Redis store
    const userId = await this.nonceStore.validate(dto.nonce);
    if (!userId) {
      throw new BadRequestException('Invalid or expired nonce');
    }

    const token = `ext_${dto.nonce}`;
    const expiresAt = Math.floor(Date.now() / 1000) + 86400; // 24 hours

    return { token, expires_at: expiresAt, user_id: userId };
  }

  @Post('auth/verify')
  @ApiOperation({ summary: 'Verify Clerk JWT and issue extension session token' })
  async authVerify(@Body() dto: AuthVerifyDto): Promise<AuthVerifyResponse> {
    // Verify the Clerk JWT token
    const verified = await this.authVerifier.verify(dto.clerkToken);

    // Generate a session token for the extension
    const token = `ext_${verified.userId}_${Date.now()}`;
    const expiresAt = Math.floor(Date.now() / 1000) + 86400; // 24 hours

    // Ensure user exists in our system
    await this.service.upsert(verified.userId, verified.email || 'unknown@findwith.com');

    return { token, expires_at: expiresAt, user_id: verified.userId };
  }
}
