import { Injectable, NotFoundException, ForbiddenException, UnprocessableEntityException } from '@nestjs/common';
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
    // kind is accepted for forward-compatibility; both 'direct' and 'natural_request'
    // perform direct replacement in v0.1 — LLM-mediated editing is a future TODO.
    _kind: 'direct' | 'natural_request' = 'direct',
  ): Promise<TailoringResume> {
    const resume = await this.findOne(userId, tailoredResumeId);
    const sections = (resume.sections ?? []) as Array<{
      bullets: Array<{ id: string; text: string; source: string; status?: string }>;
    }>;

    let updated = false;
    for (const section of sections) {
      for (const bullet of section.bullets) {
        if (bullet.id === bulletId) {
          bullet.text = newText;
          bullet.source = 'USER_EDITED';
          (bullet as Record<string, unknown>).status = 'USER_EDITED';
          updated = true;
        }
      }
    }

    if (!updated) throw new NotFoundException('Bullet not found');
    resume.sections = sections;
    return this.resumeRepo.save(resume);
  }

  /**
   * Shared type for resume sections with bullet status.
   */
  private getSections(resume: TailoringResume) {
    return (resume.sections ?? []) as Array<{
      title: string;
      bullets: Array<{ id: string; text: string; status: string }>;
    }>;
  }

  /**
   * Guard: throws 422 if any bullet is still in PENDING state.
   */
  private assertNoPendingBullets(
    sections: Array<{ title: string; bullets: Array<{ id: string; text: string; status: string }> }>,
  ): void {
    const pendingBulletIds = sections.flatMap((s) =>
      s.bullets.filter((b) => b.status === 'PENDING').map((b) => b.id),
    );
    if (pendingBulletIds.length > 0) {
      throw new UnprocessableEntityException({
        message: 'Resume has unconfirmed bullets that must be resolved before export',
        pendingBulletIds,
      });
    }
  }

  /**
   * Build plain-text resume content from sections.
   */
  private buildPlainText(
    sections: Array<{ title: string; bullets: Array<{ text: string }> }>,
  ): string {
    return sections
      .map((s) => `${s.title}\n${s.bullets.map((b) => `• ${b.text}`).join('\n')}`)
      .join('\n\n');
  }

  /**
   * Export consumes quota (not creation). §quota: consume_on_export.
   */
  async exportPlainText(userId: string, tailoredResumeId: string): Promise<string> {
    const resume = await this.findOne(userId, tailoredResumeId);
    const sections = this.getSections(resume);

    // Guard: reject if any bullets are still PENDING
    this.assertNoPendingBullets(sections);

    // Consume quota slot (idempotent on retry)
    await this.quota.consumeOnExport(userId, tailoredResumeId);

    return this.buildPlainText(sections);
  }

  /**
   * Unified export method used by POST :id/exports.
   * fmt='pdf' returns a text/plain download for now.
   * TODO: replace with actual PDF generation (add pdf-lib to dependencies).
   */
  async exportResume(
    userId: string,
    tailoredResumeId: string,
    fmt: string | undefined,
  ): Promise<{ content: string; filename: string; contentType: string }> {
    const resume = await this.findOne(userId, tailoredResumeId);
    const sections = this.getSections(resume);

    // Guard: reject if any bullets are still PENDING
    this.assertNoPendingBullets(sections);

    // Consume quota slot (idempotent on retry)
    await this.quota.consumeOnExport(userId, tailoredResumeId);

    const content = this.buildPlainText(sections);

    // TODO: When pdf-lib is added, branch on fmt === 'pdf' to return a real PDF Buffer.
    // For v0.1 both fmt values return plain text with a .txt filename.
    return {
      content,
      contentType: 'text/plain; charset=utf-8',
      filename: 'resume.txt',
    };
  }
}
