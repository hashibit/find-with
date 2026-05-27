import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { TailoringResume } from '../../database/entities/tailoring/tailoring-resume.entity.js';
import { TailoringSnapshot } from '../../database/entities/tailoring/tailoring-snapshot.entity.js';
import { QuotaService } from '../quota/quota.service.js';
import { ulid } from 'ulid';

export const TAILORING_QUEUE = 'TAILORING';

@Injectable()
export class TailoringService {
  constructor(
    @InjectRepository(TailoringResume)
    private readonly resumeRepo: Repository<TailoringResume>,
    @InjectRepository(TailoringSnapshot)
    private readonly snapshotRepo: Repository<TailoringSnapshot>,
    private readonly quota: QuotaService,
    @InjectQueue(TAILORING_QUEUE) private readonly queue: Queue,
  ) {}

  async start(userId: string, baseResumeId: string, parsedJdId: string): Promise<TailoringResume> {
    const resume = this.resumeRepo.create({ id: ulid(), userId, baseResumeId, parsedJdId });
    await this.resumeRepo.save(resume);
    await this.queue.add('tailor', { tailoredResumeId: resume.id, userId });
    return resume;
  }

  async findOne(userId: string, id: string): Promise<TailoringResume> {
    const resume = await this.resumeRepo.findOne({ where: { id } });
    if (!resume) throw new NotFoundException('Tailored resume not found');
    if (resume.userId !== userId) throw new ForbiddenException();
    return resume;
  }

  async editBullet(
    userId: string,
    tailoredResumeId: string,
    bulletId: string,
    newText: string,
  ): Promise<TailoringResume> {
    const resume = await this.findOne(userId, tailoredResumeId);
    const sections = (resume.sections ?? []) as Array<{
      bullets: Array<{ id: string; text: string; source: string }>;
    }>;

    let updated = false;
    for (const section of sections) {
      for (const bullet of section.bullets) {
        if (bullet.id === bulletId) {
          bullet.text = newText;
          bullet.source = 'USER_EDITED';
          updated = true;
        }
      }
    }

    if (!updated) throw new NotFoundException('Bullet not found');
    resume.sections = sections;
    return this.resumeRepo.save(resume);
  }

  /**
   * Export consumes quota (not creation). §quota: consume_on_export.
   */
  async exportPlainText(userId: string, tailoredResumeId: string): Promise<string> {
    const resume = await this.findOne(userId, tailoredResumeId);

    // Consume quota slot (idempotent on retry)
    await this.quota.consumeOnExport(userId, tailoredResumeId);

    const sections = (resume.sections ?? []) as Array<{
      title: string;
      bullets: Array<{ text: string }>;
    }>;

    return sections
      .map((s) => `${s.title}\n${s.bullets.map((b) => `• ${b.text}`).join('\n')}`)
      .join('\n\n');
  }
}
