import {
  Body, Controller, Delete, Get, Param, Patch, Post,
  UploadedFile, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes } from '@nestjs/swagger';
import { IsOptional, IsString, IsArray, IsIn } from 'class-validator';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { ProfileService } from './profile.service';
import { STORAGE, Storage } from '../../adapters/storage/storage.interface';
import { Inject } from '@nestjs/common';
import { ulid } from 'ulid';

class CreateMaterialDto {
  @IsOptional() @IsString() rawText?: string;
  @IsOptional() @IsString() shiningText?: string;
  @IsOptional() @IsString() rationale?: string;
  @IsOptional() @IsArray() tags?: string[];
  @IsString() provenanceKind: string;
}

class UpdateMaterialDto {
  @IsOptional() @IsString() shiningText?: string;
  @IsOptional() @IsString() rationale?: string;
  @IsOptional() @IsArray() tags?: string[];
  @IsOptional() @IsIn(['PROPOSED', 'CONFIRMED', 'USER_EDITED']) status?: string;
}

class CreateBaseResumeDto {
  @IsString() name: string;
  @IsOptional() @IsArray() selectedMaterialIds?: string[];
}

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
