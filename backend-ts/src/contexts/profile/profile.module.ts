import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { ProfileController } from './profile.controller';
import { ProfileService, RESUME_PARSE_QUEUE } from './profile.service';
import { ProfileProcessor } from './profile.processor';
import { ProfileResumeSource } from '../../database/entities/profile/resume-source.entity';
import { ProfileProfile } from '../../database/entities/profile/profile.entity';
import { ProfileEducation } from '../../database/entities/profile/education.entity';
import { ProfileWorkExperience } from '../../database/entities/profile/work-experience.entity';
import { ProfileProject } from '../../database/entities/profile/project.entity';
import { ProfileSkill } from '../../database/entities/profile/skill.entity';
import { ProfileMaterial } from '../../database/entities/profile/material.entity';
import { ProfileBaseResume } from '../../database/entities/profile/base-resume.entity';
import { FIELD_CRYPTO } from '../../common/crypto/crypto.interface';
import { EnvelopeCryptoService } from '../../common/crypto/envelope-crypto.service';
import { EphemeralCryptoService } from '../../common/crypto/ephemeral-crypto.service';
import { STORAGE } from '../../adapters/storage/storage.interface';
import { S3StorageAdapter } from '../../adapters/storage/s3-storage.adapter';
import { AppConfig } from '../../config/configuration';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ProfileResumeSource, ProfileProfile, ProfileEducation,
      ProfileWorkExperience, ProfileProject, ProfileSkill,
      ProfileMaterial, ProfileBaseResume,
    ]),
    BullModule.registerQueue({ name: RESUME_PARSE_QUEUE }),
  ],
  controllers: [ProfileController],
  providers: [
    ProfileService,
    ProfileProcessor,
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
  exports: [ProfileService],
})
export class ProfileModule {}
