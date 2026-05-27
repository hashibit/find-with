import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { IsString } from 'class-validator';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { TailoringService } from './tailoring.service';

class StartTailoringDto {
  @IsString() baseResumeId: string;
  @IsString() parsedJdId: string;
}

class EditBulletDto {
  @IsString() text: string;
}

@ApiTags('tailoring')
@ApiBearerAuth()
@UseGuards(ClerkAuthGuard)
@Controller('tailoring')
export class TailoringController {
  constructor(private readonly service: TailoringService) {}

  @Post()
  @ApiOperation({ summary: 'Start resume tailoring (async)' })
  async start(@CurrentUser() user: AuthenticatedUser, @Body() dto: StartTailoringDto) {
    return this.service.start(user.userId, dto.baseResumeId, dto.parsedJdId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get tailored resume' })
  async get(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.findOne(user.userId, id);
  }

  @Patch(':id/bullets/:bulletId')
  @ApiOperation({ summary: 'Edit a bullet point' })
  async editBullet(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('bulletId') bulletId: string,
    @Body() dto: EditBulletDto,
  ) {
    return this.service.editBullet(user.userId, id, bulletId, dto.text);
  }

  @Get(':id/export')
  @ApiOperation({ summary: 'Export as plain text (consumes quota)' })
  async export(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    const text = await this.service.exportPlainText(user.userId, id);
    return { text };
  }
}
