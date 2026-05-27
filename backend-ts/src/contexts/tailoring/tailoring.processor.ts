import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TailoringResume } from '../../database/entities/tailoring/tailoring-resume.entity';
import { JobParsedJd } from '../../database/entities/jobs/parsed-jd.entity';
import { ProfileBaseResume } from '../../database/entities/profile/base-resume.entity';
import { ProfileMaterial } from '../../database/entities/profile/material.entity';
import { LlmService, MODEL_WRITE } from '../../llm/llm.service';
import { TAILORING_QUEUE } from './tailoring.service';
import { ulid } from 'ulid';

@Processor(TAILORING_QUEUE)
export class TailoringProcessor extends WorkerHost {
  private readonly logger = new Logger(TailoringProcessor.name);

  constructor(
    @InjectRepository(TailoringResume) private readonly resumeRepo: Repository<TailoringResume>,
    @InjectRepository(JobParsedJd) private readonly jdRepo: Repository<JobParsedJd>,
    @InjectRepository(ProfileBaseResume) private readonly baseResumeRepo: Repository<ProfileBaseResume>,
    @InjectRepository(ProfileMaterial) private readonly materialRepo: Repository<ProfileMaterial>,
    private readonly llm: LlmService,
  ) {
    super();
  }

  async process(job: Job<{ tailoredResumeId: string; userId: string }>): Promise<void> {
    const { tailoredResumeId, userId } = job.data;
    const tailored = await this.resumeRepo.findOne({ where: { id: tailoredResumeId } });
    if (!tailored) return;

    const [parsedJd, baseResume] = await Promise.all([
      this.jdRepo.findOne({ where: { id: tailored.parsedJdId } }),
      this.baseResumeRepo.findOne({ where: { id: tailored.baseResumeId } }),
    ]);

    if (!parsedJd || !baseResume) {
      this.logger.warn(`Missing JD or base resume for tailoring ${tailoredResumeId}`);
      return;
    }

    // Get confirmed materials
    const materialIds = baseResume.selectedMaterialIds ?? [];
    const materials = await this.materialRepo.find({ where: { userId, status: 'CONFIRMED' } });
    const relevantMaterials = materialIds.length > 0
      ? materials.filter((m) => materialIds.includes(m.id))
      : materials;

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

    const raw = await this.llm.complete(MODEL_WRITE, [
      { role: 'system', content: 'You write tailored resume sections. Use only provided materials. Output JSON.' },
      { role: 'user', content: prompt },
    ]);

    let sections: unknown[] = [];
    try {
      const m = raw.match(/\[[\s\S]*\]/);
      if (m) sections = JSON.parse(m[0]) as unknown[];
    } catch {
      this.logger.warn('Failed to parse tailoring output');
    }

    // Add ULIDs to bullets that don't have them
    for (const section of sections as Array<{ bullets: Array<{ id?: string }> }>) {
      for (const bullet of section.bullets ?? []) {
        if (!bullet.id) bullet.id = ulid();
      }
    }

    tailored.sections = sections;
    tailored.matchBefore = null;
    tailored.matchAfter = null;
    await this.resumeRepo.save(tailored);

    this.logger.log(`Tailoring complete for ${tailoredResumeId}`);
  }
}
