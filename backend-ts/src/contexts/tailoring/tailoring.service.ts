import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  UnprocessableEntityException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { TailoringResume } from '../../database/entities/tailoring/tailoring-resume.entity.js';
import { TailoringBullet, BulletStatus } from '../../database/entities/tailoring/tailoring-bullet.entity.js';
import { TailoringSnapshot } from '../../database/entities/tailoring/tailoring-snapshot.entity.js';
import { ProfileMaterial } from '../../database/entities/profile/material.entity.js';
import { QuotaService } from '../quota/quota.service.js';
import { ulid } from 'ulid';

export const TAILORING_QUEUE = 'TAILORING';

type BulletDto = {
  id: string;
  text: string;
  source: string;
  sourceId: string | null;
  status: string;
};

type SectionDto = {
  title: string;
  bullets: BulletDto[];
};

/** Shape returned to callers — resume with a reconstructed `sections` property for API compatibility. */
export type TailoringResumeWithSections = TailoringResume & { sections: SectionDto[] };

@Injectable()
export class TailoringService {
  constructor(
    @InjectRepository(TailoringResume)
    private readonly resumeRepo: Repository<TailoringResume>,
    @InjectRepository(TailoringBullet)
    private readonly bulletRepo: Repository<TailoringBullet>,
    @InjectRepository(TailoringSnapshot)
    private readonly snapshotRepo: Repository<TailoringSnapshot>,
    @InjectRepository(ProfileMaterial)
    private readonly materialRepo: Repository<ProfileMaterial>,
    private readonly quota: QuotaService,
    @InjectQueue(TAILORING_QUEUE) private readonly queue: Queue,
  ) {}

  async start(userId: string, baseResumeId: string, parsedJdId: string): Promise<TailoringResume> {
    const resume = this.resumeRepo.create({ id: ulid(), userId, baseResumeId, parsedJdId });
    await this.resumeRepo.save(resume);
    await this.queue.add('tailor', { tailoredResumeId: resume.id, userId });
    return resume;
  }

  async findOne(userId: string, id: string): Promise<TailoringResumeWithSections> {
    const resume = await this.resumeRepo.findOne({ where: { id } });
    if (!resume) throw new NotFoundException('Tailored resume not found');
    if (resume.userId !== userId) throw new ForbiddenException();

    const bullets = await this.bulletRepo.find({
      where: { resumeId: id },
      order: { sectionTitle: 'ASC', position: 'ASC' },
    });

    const sections = this.groupBulletsIntoSections(bullets);
    return Object.assign(resume, { sections });
  }

  async editBullet(
    userId: string,
    tailoredResumeId: string,
    bulletId: string,
    newText: string,
    // kind is accepted for forward-compatibility; both 'direct' and 'natural_request'
    // perform direct replacement in v0.1 — LLM-mediated editing is a future TODO.
    _kind: 'direct' | 'natural_request' = 'direct',
  ): Promise<TailoringResumeWithSections> {
    // Verify ownership first
    const resume = await this.resumeRepo.findOne({ where: { id: tailoredResumeId } });
    if (!resume) throw new NotFoundException('Tailored resume not found');
    if (resume.userId !== userId) throw new ForbiddenException();

    const bullet = await this.bulletRepo.findOne({
      where: { id: bulletId, resumeId: tailoredResumeId },
    });
    if (!bullet) throw new NotFoundException('Bullet not found');

    bullet.text = newText;
    bullet.source = 'USER_EDITED';
    bullet.status = BulletStatus.USER_EDITED;
    await this.bulletRepo.save(bullet);

    return this.findOne(userId, tailoredResumeId);
  }

  async reApplyMaterial(
    userId: string,
    tailoredResumeId: string,
    bulletId: string,
    materialId: string,
  ): Promise<TailoringResumeWithSections> {
    // Verify ownership first
    const resume = await this.resumeRepo.findOne({ where: { id: tailoredResumeId } });
    if (!resume) throw new NotFoundException('Tailored resume not found');
    if (resume.userId !== userId) throw new ForbiddenException();

    const material = await this.materialRepo.findOne({ where: { id: materialId } });
    if (!material || material.userId !== userId) {
      throw new NotFoundException('Material not found');
    }
    if (material.status !== 'CONFIRMED' && material.status !== 'USER_EDITED') {
      throw new BadRequestException('Material not confirmed');
    }

    const bullet = await this.bulletRepo.findOne({
      where: { id: bulletId, resumeId: tailoredResumeId },
    });
    if (!bullet) throw new NotFoundException('Bullet not found');

    bullet.sourceId = materialId;
    bullet.status = BulletStatus.CONFIRMED;
    await this.bulletRepo.save(bullet);

    return this.findOne(userId, tailoredResumeId);
  }

  /**
   * Guard: throws 422 if any bullet for this resume is still in PENDING state.
   */
  private async assertNoPendingBullets(resumeId: string): Promise<void> {
    const pendingCount = await this.bulletRepo.count({
      where: { resumeId, status: BulletStatus.PENDING },
    });
    if (pendingCount > 0) {
      const pendingBullets = await this.bulletRepo.find({
        where: { resumeId, status: BulletStatus.PENDING },
        select: ['id'],
      });
      throw new UnprocessableEntityException({
        message: 'Resume has unconfirmed bullets that must be resolved before export',
        pendingBulletIds: pendingBullets.map((b) => b.id),
      });
    }
  }

  /**
   * Build plain-text resume content from bullets.
   */
  private buildPlainText(bullets: TailoringBullet[]): string {
    const sections = this.groupBulletsIntoSections(bullets);
    return sections
      .map((s) => `${s.title}\n${s.bullets.map((b) => `• ${b.text}`).join('\n')}`)
      .join('\n\n');
  }

  /**
   * Group a flat list of TailoringBullet rows into the sections shape
   * expected by the API response (and plain-text builder).
   * Input should already be sorted by sectionTitle + position.
   */
  private groupBulletsIntoSections(bullets: TailoringBullet[]): SectionDto[] {
    const map = new Map<string, BulletDto[]>();
    for (const b of bullets) {
      if (!map.has(b.sectionTitle)) map.set(b.sectionTitle, []);
      map.get(b.sectionTitle)!.push({
        id: b.id,
        text: b.text,
        source: b.source,
        sourceId: b.sourceId,
        status: b.status,
      });
    }
    return Array.from(map.entries()).map(([title, bs]) => ({ title, bullets: bs }));
  }

  /**
   * Export consumes quota (not creation). §quota: consume_on_export.
   */
  async exportPlainText(userId: string, tailoredResumeId: string): Promise<string> {
    const resume = await this.resumeRepo.findOne({ where: { id: tailoredResumeId } });
    if (!resume) throw new NotFoundException('Tailored resume not found');
    if (resume.userId !== userId) throw new ForbiddenException();

    await this.assertNoPendingBullets(tailoredResumeId);

    const bullets = await this.bulletRepo.find({
      where: { resumeId: tailoredResumeId },
      order: { sectionTitle: 'ASC', position: 'ASC' },
    });

    // Consume quota slot (idempotent on retry)
    await this.quota.consumeOnExport(userId, tailoredResumeId);

    return this.buildPlainText(bullets);
  }

  async exportResume(
    userId: string,
    tailoredResumeId: string,
    fmt: string | undefined,
  ): Promise<{ content: Buffer | string; filename: string; contentType: string }> {
    const resume = await this.resumeRepo.findOne({ where: { id: tailoredResumeId } });
    if (!resume) throw new NotFoundException('Tailored resume not found');
    if (resume.userId !== userId) throw new ForbiddenException();

    await this.assertNoPendingBullets(tailoredResumeId);

    const bullets = await this.bulletRepo.find({
      where: { resumeId: tailoredResumeId },
      order: { sectionTitle: 'ASC', position: 'ASC' },
    });

    await this.quota.consumeOnExport(userId, tailoredResumeId);

    if (fmt === 'pdf') {
      return {
        content: await this.buildPdf(bullets),
        contentType: 'application/pdf',
        filename: 'resume.pdf',
      };
    }
    return {
      content: this.buildPlainText(bullets),
      contentType: 'text/plain; charset=utf-8',
      filename: 'resume.txt',
    };
  }

  private async buildPdf(bullets: TailoringBullet[]): Promise<Buffer> {
    const PDFDocument = (await import('pdfkit')).default;
    const sections = this.groupBulletsIntoSections(bullets);

    return new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({ margin: 54, size: 'LETTER' });
      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const INK = '#111928';
      const MUTE = '#6b7280';
      const ACCENT = '#4f46e5';

      doc.font('Helvetica-Bold').fontSize(18).fillColor(INK).text('Tailored Résumé');
      doc.moveDown(0.3);
      doc.moveTo(54, doc.y).lineTo(doc.page.width - 54, doc.y).strokeColor(ACCENT).lineWidth(1).stroke();
      doc.moveDown(0.6);

      for (const section of sections) {
        doc.font('Helvetica-Bold').fontSize(11).fillColor(ACCENT).text(section.title.toUpperCase());
        doc.moveDown(0.2);
        doc.moveTo(54, doc.y).lineTo(doc.page.width - 54, doc.y).strokeColor('#e5e7eb').lineWidth(0.5).stroke();
        doc.moveDown(0.3);
        for (const b of section.bullets) {
          doc.font('Helvetica').fontSize(10).fillColor(INK).text(`• ${b.text}`, { indent: 10, lineGap: 2 });
          doc.moveDown(0.25);
        }
        doc.moveDown(0.4);
      }

      doc.font('Helvetica').fontSize(8).fillColor(MUTE)
        .text(`Generated by FindWith Quinn · ${new Date().toLocaleDateString('en-US')}`, { align: 'center' });
      doc.end();
    });
  }
}
