import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { CurrentUser, type AuthenticatedUser } from '../../common/decorators/current-user.decorator.js';
import { TailoringService } from './tailoring.service.js';

class StartTailoringDto extends createZodDto(
  z.object({
    baseResumeId: z.string(),
    parsedJdId: z.string(),
  }),
) {}

class EditBulletDto extends createZodDto(z.object({ text: z.string() })) {}

@ApiTags('tailoring')
@ApiBearerAuth()
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
