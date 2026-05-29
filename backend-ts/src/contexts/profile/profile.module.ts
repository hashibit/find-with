import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { ProfileController } from './profile.controller.js';
import { ProfileService, RESUME_PARSE_QUEUE } from './profile.service.js';
import { ProfileProcessor } from './profile.processor.js';
import { MaterialManager } from './material-manager.service.js';
import { ProfileResumeSource } from '../../database/entities/profile/resume-source.entity.js';
import { ProfileProfile } from '../../database/entities/profile/profile.entity.js';
import { ProfileEducation } from '../../database/entities/profile/education.entity.js';
import { ProfileWorkExperience } from '../../database/entities/profile/work-experience.entity.js';
import { ProfileProject } from '../../database/entities/profile/project.entity.js';
import { ProfileSkill } from '../../database/entities/profile/skill.entity.js';
import { ProfileMaterial } from '../../database/entities/profile/material.entity.js';
import { ProfileBaseResume } from '../../database/entities/profile/base-resume.entity.js';
import { FIELD_CRYPTO } from '../../common/crypto/crypto.interface.js';
import { EnvelopeCryptoService } from '../../common/crypto/envelope-crypto.service.js';
import { EphemeralCryptoService } from '../../common/crypto/ephemeral-crypto.service.js';
import { STORAGE } from '../../adapters/storage/storage.interface.js';
import { S3StorageAdapter } from '../../adapters/storage/s3-storage.adapter.js';
import { AppConfig } from '../../config/configuration.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ProfileResumeSource,
      ProfileProfile,
      ProfileEducation,
      ProfileWorkExperience,
      ProfileProject,
      ProfileSkill,
      ProfileMaterial,
      ProfileBaseResume,
    ]),
    BullModule.registerQueue({ name: RESUME_PARSE_QUEUE }),
  ],
  controllers: [ProfileController],
  providers: [
    ProfileService,
    ProfileProcessor,
    MaterialManager,
    {
      provide: FIELD_CRYPTO,
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig>) =>
        config.get('env', { infer: true }) === 'production'
          ? new EnvelopeCryptoService(config)
          : new EphemeralCryptoService(),
    },
    {
      provide: STORAGE,
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig>) => new S3StorageAdapter(config),
    },
  ],
  exports: [ProfileService, MaterialManager],
})
export class ProfileModule {}
