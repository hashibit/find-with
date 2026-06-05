import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, Inject } from '@nestjs/common';
import { Job } from 'bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TailoringResume } from '../../database/entities/tailoring/tailoring-resume.entity.js';
import { TailoringBullet, BulletStatus } from '../../database/entities/tailoring/tailoring-bullet.entity.js';
import { JobParsedJd } from '../../database/entities/jobs/parsed-jd.entity.js';
import { ProfileBaseResume } from '../../database/entities/profile/base-resume.entity.js';
import { LLM_PROVIDER, type LlmProvider } from '../../llm/llm-provider.interface.js';
import { MaterialManager } from '../profile/material-manager.service.js';
import { TAILORING_QUEUE } from './tailoring.service.js';
import { ulid } from 'ulid';

type TailoringMaterial = {
  id: string;
  shiningText: string;
  tags: string[];
};

@Processor(TAILORING_QUEUE)
export class TailoringProcessor extends WorkerHost {
  private readonly logger = new Logger(TailoringProcessor.name);

  constructor(
    @InjectRepository(TailoringResume) private readonly resumeRepo: Repository<TailoringResume>,
    @InjectRepository(TailoringBullet) private readonly bulletRepo: Repository<TailoringBullet>,
    @InjectRepository(JobParsedJd) private readonly jdRepo: Repository<JobParsedJd>,
    @InjectRepository(ProfileBaseResume)
    private readonly baseResumeRepo: Repository<ProfileBaseResume>,
    @Inject(LLM_PROVIDER) private readonly llm: LlmProvider,
    private readonly materialManager: MaterialManager,
  ) {
    super();
  }

  async process(job: Job<{ tailoredResumeId: string; userId: string }>): Promise<void> {
    const { tailoredResumeId, userId } = job.data;
    const tailored = await this.resumeRepo.findOne({ where: { id: tailoredResumeId } });
    if (!tailored) return;

    // Idempotent: skip generation if bullets already exist
    const existingCount = await this.bulletRepo.count({ where: { resumeId: tailoredResumeId } });
    if (existingCount > 0) {
      this.logger.log(`Tailoring ${tailoredResumeId} already has bullets — skipping generation`);
      return;
    }

    const [parsedJd, baseResume] = await Promise.all([
      this.jdRepo.findOne({ where: { id: tailored.parsedJdId } }),
      this.baseResumeRepo.findOne({ where: { id: tailored.baseResumeId } }),
    ]);

    if (!parsedJd || !baseResume) {
      this.logger.warn(`Missing JD or base resume for tailoring ${tailoredResumeId}`);
      return;
    }

    // MaterialManager owns all material reads
    const relevantMaterials = await this.materialManager.forTailoring(
      userId,
      baseResume.selectedMaterialIds ?? null,
    );

    const materialContext = relevantMaterials
      .map((m) => `- ${m.shiningText ?? ''} [${(m.tags ?? []).join(', ')}]`)
      .join('\n');

    const prompt = `Generate a tailored resume work experience section for this job.

Job: ${parsedJd.title ?? 'Unknown'} at ${parsedJd.company ?? 'Unknown'}
Required skills: ${(parsedJd.hardSkills ?? []).join(', ')}

Candidate's confirmed achievements (use ONLY these, never fabricate):
${materialContext || '(no materials yet)'}

Return JSON array of sections:
[{
  "title": "Work Experience",
  "bullets": [{
    "id": "bullet_ULID",
    "text": "Strong bullet point using achievement above",
    "source": "MATERIAL",
    "sourceId": "material_id_if_applicable",
    "status": "CONFIRMED"
  }]
}]

Rules:
- Only use achievements from the candidate's materials
- Rewrite them to match JD language
- Use strong action verbs
- Mark bullets you had to infer (not directly from materials) as status: "PENDING"`;

    const raw = await this.llm.completeContext({
      systemPrompt: 'You write tailored resume sections. Use only provided materials. Output JSON. BEFORE OUTPUTTING, ensure you are using materials from the list provided. If a bullet cannot reference an exact material, mark it as status: "PENDING".',
      messages: [{ role: 'user', content: prompt, timestamp: Date.now() }],
    });

    let sections: unknown[] = [];
    try {
      const m = raw.match(/\[[\s\S]*\]/);
      if (m) sections = JSON.parse(m[0]) as unknown[];
    } catch {
      this.logger.warn('Failed to parse tailoring output');
    }

    // Validate and process sections with bullet-level validation
    const materialIds = new Set(relevantMaterials.map((m) => m.id));
    const bulletEntities: TailoringBullet[] = [];

    for (const section of sections as Array<{
      title?: string;
      bullets?: Array<{
        id?: string;
        text?: string;
        source?: string;
        sourceId?: string;
        status?: string;
      }>;
    }>) {
      const sectionTitle = (section.title as string) ?? 'Work Experience';
      const rawBullets = section.bullets ?? [];

      for (let pos = 0; pos < rawBullets.length; pos++) {
        const b = rawBullets[pos];
        const id = b.id ?? ulid();
        const text = (b.text as string) ?? '';
        const source = (b.source as string) ?? 'MATERIAL';
        const sourceId = b.sourceId as string | undefined;
        let status: BulletStatus = (b.status as BulletStatus) ?? BulletStatus.PENDING;

        // Bullet fail-fast validation: sourceId must reference a valid material
        // If not, we must mark it as PENDING (model inferred rather than confirmed)
        if (sourceId && materialIds.has(sourceId)) {
          // Valid sourceId referencing a confirmed material - accept CONFIRMED status
          if (status === BulletStatus.PENDING) {
            // LLM marked it as PENDING despite valid sourceId - trust the model
            status = BulletStatus.PENDING;
          } else {
            status = BulletStatus.CONFIRMED;
          }
        } else {
          // No valid sourceId - LLM fabricated or incorrectly referenced
          this.logger.warn(`Bullet has no valid sourceId (sourceId=${sourceId}); marking as PENDING`);
          status = BulletStatus.PENDING;
        }

        bulletEntities.push(
          this.bulletRepo.create({
            id,
            resumeId: tailoredResumeId,
            sectionTitle,
            position: pos,
            text,
            source,
            sourceId: sourceId ?? null,
            status,
          }),
        );
      }
    }

    await this.bulletRepo.save(bulletEntities);

    tailored.matchBefore = null;
    tailored.matchAfter = null;
    await this.resumeRepo.save(tailored);

    this.logger.log(`Tailoring complete for ${tailoredResumeId}`);
  }
}
