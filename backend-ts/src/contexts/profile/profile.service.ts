import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ProfileProfile } from '../../database/entities/profile/profile.entity';
import { ProfileMaterial } from '../../database/entities/profile/material.entity';
import { ProfileBaseResume } from '../../database/entities/profile/base-resume.entity';
import { ProfileResumeSource } from '../../database/entities/profile/resume-source.entity';
import { FIELD_CRYPTO, FieldCrypto } from '../../common/crypto/crypto.interface';
import { Inject } from '@nestjs/common';
import { ulid } from 'ulid';
import { randomBytes } from 'crypto';

export const RESUME_PARSE_QUEUE = 'RESUME_PARSE';

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
    @Inject(FIELD_CRYPTO) private readonly crypto: FieldCrypto,
    @InjectQueue(RESUME_PARSE_QUEUE) private readonly parseQueue: Queue,
  ) {}

  async uploadResume(userId: string, blobUri: string, filename: string, contentType: string): Promise<ProfileResumeSource> {
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
    return this.profileRepo.findOne({ where: { userId } });
  }

  async upsertProfile(userId: string, patch: Partial<Pick<ProfileProfile, 'basicInfo' | 'certifications'>>): Promise<ProfileProfile> {
    const etag = randomBytes(8).toString('hex');
    await this.profileRepo.upsert({ userId, ...patch, etag, updatedAt: new Date() }, ['userId']);
    return (await this.profileRepo.findOne({ where: { userId } }))!;
  }

  async listMaterials(userId: string): Promise<Array<Omit<ProfileMaterial, 'rawText'> & { rawText?: string }>> {
    const materials = await this.materialRepo.find({ where: { userId }, order: { createdAt: 'DESC' } });
    return Promise.all(
      materials.map(async (m) => {
        const { rawText, ...rest } = m;
        if (rawText) {
          return { ...rest, rawText: await this.crypto.decrypt(rawText) };
        }
        return { ...rest, rawText: undefined };
      }),
    );
  }

  async createMaterial(
    userId: string,
    data: { rawText?: string; shiningText?: string; rationale?: string; tags?: string[]; provenanceKind: string },
  ): Promise<ProfileMaterial> {
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
    return this.materialRepo.save(material);
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

  async createBaseResume(userId: string, name: string, selectedMaterialIds?: string[]): Promise<ProfileBaseResume> {
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
