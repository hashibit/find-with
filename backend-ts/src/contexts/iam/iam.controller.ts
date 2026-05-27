import { Body, Controller, Get, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { IsOptional, IsString, IsIn } from 'class-validator';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { IamService } from './iam.service';

class UpsertUserDto {
  @IsString()
  email: string;

  @IsOptional()
  @IsString()
  fullName?: string;
}

class UpdateSettingsDto {
  @IsOptional()
  @IsIn(['ENGAGED', 'BALANCED', 'QUIET'])
  density?: string;

  @IsOptional()
  @IsString()
  locale?: string;

  @IsOptional()
  @IsString()
  timezone?: string;
}

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
