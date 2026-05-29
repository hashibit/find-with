import { Body, Controller, Get, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard.js';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator.js';
import { IamService } from './iam.service.js';

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

@ApiTags('iam')
@ApiBearerAuth()
@UseGuards(ClerkAuthGuard)
@Controller('iam')
export class IamController {
  constructor(private readonly service: IamService) {}

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
}
