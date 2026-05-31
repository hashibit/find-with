import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query, Res } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { type Response } from 'express';
import { CurrentUser, type AuthenticatedUser } from '../../common/decorators/current-user.decorator.js';
import { TailoringService } from './tailoring.service.js';

class StartTailoringDto extends createZodDto(
  z.object({
    baseResumeId: z.string(),
    parsedJdId: z.string(),
  }),
) {}

class EditBulletDto extends createZodDto(
  z.object({
    text: z.string(),
    kind: z.enum(['direct', 'natural_request']).default('direct').optional(),
  }),
) {}

class ReApplyMaterialDto extends createZodDto(
  z.object({
    materialId: z.string(),
  }),
) {}

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
    return this.service.editBullet(user.userId, id, bulletId, dto.text, dto.kind);
  }

  @Post(':id/bullets/:bulletId/source')
  @HttpCode(200)
  @ApiOperation({ summary: 'Bind a confirmed material to a pending bullet' })
  async reApplyMaterial(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('bulletId') bulletId: string,
    @Body() dto: ReApplyMaterialDto,
  ) {
    return this.service.reApplyMaterial(user.userId, id, bulletId, dto.materialId);
  }

  @Get(':id/export')
  @ApiOperation({ summary: 'Export as plain text (consumes quota)' })
  async export(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    const text = await this.service.exportPlainText(user.userId, id);
    return { text };
  }

  @Post(':id/exports')
  @ApiOperation({ summary: 'Export resume as PDF (plain text fallback in v0.1)' })
  @ApiQuery({ name: 'fmt', required: false, description: 'Export format: pdf (returns text/plain for now)' })
  async exportResume(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query('fmt') fmt: string,
    @Res() res: Response,
  ) {
    const { content, filename, contentType } = await this.service.exportResume(user.userId, id, fmt);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', contentType);
    res.send(content);
  }
}
