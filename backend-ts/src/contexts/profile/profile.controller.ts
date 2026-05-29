import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes } from '@nestjs/swagger';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard.js';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator.js';
import { ProfileService } from './profile.service.js';
import { STORAGE, Storage } from '../../adapters/storage/storage.interface.js';
import { Inject } from '@nestjs/common';
import { ulid } from 'ulid';

class CreateMaterialDto extends createZodDto(
  z.object({
    rawText: z.string().optional(),
    shiningText: z.string().optional(),
    rationale: z.string().optional(),
    tags: z.array(z.string()).optional(),
    provenanceKind: z.string(),
  }),
) {}

class UpdateMaterialDto extends createZodDto(
  z.object({
    shiningText: z.string().optional(),
    rationale: z.string().optional(),
    tags: z.array(z.string()).optional(),
    status: z.enum(['PROPOSED', 'CONFIRMED', 'USER_EDITED']).optional(),
  }),
) {}

class CreateBaseResumeDto extends createZodDto(
  z.object({
    name: z.string(),
    selectedMaterialIds: z.array(z.string()).optional(),
  }),
) {}

@ApiTags('profile')
@ApiBearerAuth()
@UseGuards(ClerkAuthGuard)
@Controller('profile')
export class ProfileController {
  constructor(
    private readonly service: ProfileService,
    @Inject(STORAGE) private readonly storage: Storage,
  ) {}

  @Post('resume')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload resume PDF/DOCX' })
  @UseInterceptors(FileInterceptor('file'))
  async uploadResume(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file: Express.Multer.File,
  ) {
    const key = `resumes/${user.userId}/${ulid()}-${file.originalname}`;
    const blobUri = await this.storage.upload(key, file.buffer, file.mimetype);
    return this.service.uploadResume(user.userId, blobUri, file.originalname, file.mimetype);
  }

  @Get()
  @ApiOperation({ summary: 'Get full profile' })
  async getProfile(@CurrentUser() user: AuthenticatedUser) {
    return this.service.getProfile(user.userId);
  }

  @Get('materials')
  @ApiOperation({ summary: 'List materials (shining points)' })
  async listMaterials(@CurrentUser() user: AuthenticatedUser) {
    return this.service.listMaterials(user.userId);
  }

  @Post('materials')
  @ApiOperation({ summary: 'Add a material manually' })
  async createMaterial(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateMaterialDto) {
    return this.service.createMaterial(user.userId, dto);
  }

  @Patch('materials/:id')
  @ApiOperation({ summary: 'Update a material' })
  async updateMaterial(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateMaterialDto,
  ) {
    return this.service.updateMaterial(user.userId, id, dto);
  }

  @Delete('materials/:id')
  @ApiOperation({ summary: 'Delete a material' })
  async deleteMaterial(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.deleteMaterial(user.userId, id);
  }

  @Get('base-resumes')
  @ApiOperation({ summary: 'List base resumes' })
  async listBaseResumes(@CurrentUser() user: AuthenticatedUser) {
    return this.service.listBaseResumes(user.userId);
  }

  @Post('base-resumes')
  @ApiOperation({ summary: 'Create a base resume' })
  async createBaseResume(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateBaseResumeDto) {
    return this.service.createBaseResume(user.userId, dto.name, dto.selectedMaterialIds);
  }
}
