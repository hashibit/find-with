import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ProfileProfile } from '../../database/entities/profile/profile.entity.js';
import { ProfileMaterial } from '../../database/entities/profile/material.entity.js';
import { ProfileBaseResume } from '../../database/entities/profile/base-resume.entity.js';
import { ProfileResumeSource } from '../../database/entities/profile/resume-source.entity.js';
import { ProfileWorkExperience } from '../../database/entities/profile/work-experience.entity.js';
import { ProfileEducation } from '../../database/entities/profile/education.entity.js';
import { ProfileSkill } from '../../database/entities/profile/skill.entity.js';
import { FIELD_CRYPTO, type FieldCrypto } from '../../common/crypto/crypto.interface.js';
import { Inject } from '@nestjs/common';
import { ulid } from 'ulid';
import { randomBytes } from 'crypto';

export const RESUME_PARSE_QUEUE = 'RESUME_PARSE';

type ProfileMaterialView = Omit<ProfileMaterial, 'rawText'> & { rawText?: string };

@Injectable()
export class ProfileService {
  constructor(
    @InjectRepository(ProfileProfile)
    private readonly profileRepo: Repository<ProfileProfile>,
    @InjectRepository(ProfileMaterial)
    private readonly materialRepo: Repository<ProfileMaterial>,
    @InjectRepository(ProfileBaseResume)
    private readonly baseResumeRepo: Repository<ProfileBaseResume>,
    @InjectRepository(ProfileResumeSource)
    private readonly resumeSourceRepo: Repository<ProfileResumeSource>,
    @InjectRepository(ProfileWorkExperience)
    private readonly workExpRepo: Repository<ProfileWorkExperience>,
    @InjectRepository(ProfileEducation)
    private readonly educationRepo: Repository<ProfileEducation>,
    @InjectRepository(ProfileSkill)
    private readonly skillRepo: Repository<ProfileSkill>,
    @Inject(FIELD_CRYPTO) private readonly crypto: FieldCrypto,
    @InjectQueue(RESUME_PARSE_QUEUE) private readonly parseQueue: Queue,
  ) {}

  async uploadResume(
    userId: string,
    blobUri: string,
    filename: string,
    contentType: string,
  ): Promise<ProfileResumeSource> {
    const source = this.resumeSourceRepo.create({
      id: ulid(),
      userId,
      filename,
      contentType,
      blobUri,
      parseStatus: 'PENDING',
    });
    await this.resumeSourceRepo.save(source);
    await this.parseQueue.add('parse', { sourceId: source.id, userId });
    return source;
  }

  async getProfile(userId: string): Promise<ProfileProfile | null> {
    const profile = await this.profileRepo.findOne({ where: { userId } });
    if (!profile) return null;

    // Fetch related entities separately (no join defined in entity)
    const workExperience = await this.workExpRepo.find({ where: { userId }, order: { createdAt: 'DESC' } });
    const education = await this.educationRepo.find({ where: { userId }, order: { createdAt: 'DESC' } });
    const skills = await this.skillRepo.find({ where: { userId }, order: { createdAt: 'DESC' } });

    return { ...profile, workExperience, education, skills };
  }

  async upsertProfile(
    userId: string,
    patch: Partial<Pick<ProfileProfile, 'basicInfo' | 'certifications'>>,
  ): Promise<ProfileProfile> {
    const etag = randomBytes(8).toString('hex');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await this.profileRepo.upsert({ userId, ...patch, etag, updatedAt: new Date() } as any, [
      'userId',
    ]);
    return (await this.profileRepo.findOne({ where: { userId } }))!;
  }

  async listMaterials(userId: string): Promise<Array<ProfileMaterialView>> {
    const materials = await this.materialRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
    return Promise.all(
      materials.map(async (m) => {
        const { rawText, ...rest } = m;
        return {
          ...rest,
          rawText: rawText ? await this.crypto.decrypt(rawText) : undefined,
        } as ProfileMaterialView;
      }),
    );
  }

  async createMaterial(
    userId: string,
    data: {
      rawText?: string;
      shiningText?: string;
      rationale?: string;
      tags?: string[];
      provenanceKind: string;
    },
  ): Promise<ProfileMaterialView> {
    const encryptedRaw = data.rawText ? await this.crypto.encrypt(data.rawText) : null;
    const material = this.materialRepo.create({
      id: ulid(),
      userId,
      rawText: encryptedRaw,
      shiningText: data.shiningText ?? null,
      rationale: data.rationale ?? null,
      tags: data.tags ?? null,
      provenanceKind: data.provenanceKind,
      status: 'PROPOSED',
    });
    const saved = await this.materialRepo.save(material);
    const { rawText, ...rest } = saved;
    return {
      ...rest,
      rawText: rawText ? await this.crypto.decrypt(rawText) : undefined,
    } as ProfileMaterialView;
  }

  async updateMaterial(
    userId: string,
    materialId: string,
    patch: Partial<Pick<ProfileMaterial, 'shiningText' | 'rationale' | 'tags' | 'status'>>,
  ): Promise<ProfileMaterial> {
    const material = await this.materialRepo.findOne({ where: { id: materialId } });
    if (!material) throw new NotFoundException('Material not found');
    if (material.userId !== userId) throw new ForbiddenException();
    Object.assign(material, patch);
    return this.materialRepo.save(material);
  }

  async deleteMaterial(userId: string, materialId: string): Promise<void> {
    const material = await this.materialRepo.findOne({ where: { id: materialId } });
    if (!material) throw new NotFoundException('Material not found');
    if (material.userId !== userId) throw new ForbiddenException();
    await this.materialRepo.remove(material);
  }

  async listBaseResumes(userId: string): Promise<ProfileBaseResume[]> {
    return this.baseResumeRepo.find({ where: { userId } });
  }

  async createBaseResume(
    userId: string,
    name: string,
    selectedMaterialIds?: string[],
  ): Promise<ProfileBaseResume> {
    const resume = this.baseResumeRepo.create({
      id: ulid(),
      userId,
      name,
      selectedMaterialIds: selectedMaterialIds ?? null,
      isDefault: false,
    });
    return this.baseResumeRepo.save(resume);
  }
}
