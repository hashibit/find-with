import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, Inject } from '@nestjs/common';
import { Job } from 'bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as pdfParse from 'pdf-parse';
import * as mammoth from 'mammoth';
import { ProfileResumeSource } from '../../database/entities/profile/resume-source.entity';
import { ProfileProfile } from '../../database/entities/profile/profile.entity';
import { ProfileEducation } from '../../database/entities/profile/education.entity';
import { ProfileWorkExperience } from '../../database/entities/profile/work-experience.entity';
import { ProfileSkill } from '../../database/entities/profile/skill.entity';
import { STORAGE, Storage } from '../../adapters/storage/storage.interface';
import { LlmService, MODEL_PARSE } from '../../llm/llm.service';
import { RESUME_PARSE_QUEUE } from './profile.service';
import { ulid } from 'ulid';

interface ParsedResume {
  basicInfo: { fullName?: string; email?: string; phone?: string; location?: string; linkedinUrl?: string };
  education: Array<{ school: string; degree?: string; major?: string; start?: string; end?: string; gpa?: string }>;
  workExperience: Array<{ company: string; title: string; location?: string; start?: string; end?: string; bullets: string[] }>;
  skills: Array<{ name: string; kind: string }>;
}

@Processor(RESUME_PARSE_QUEUE)
export class ProfileProcessor extends WorkerHost {
  private readonly logger = new Logger(ProfileProcessor.name);

  constructor(
    @InjectRepository(ProfileResumeSource)
    private readonly sourceRepo: Repository<ProfileResumeSource>,
    @InjectRepository(ProfileProfile)
    private readonly profileRepo: Repository<ProfileProfile>,
    @InjectRepository(ProfileEducation)
    private readonly eduRepo: Repository<ProfileEducation>,
    @InjectRepository(ProfileWorkExperience)
    private readonly expRepo: Repository<ProfileWorkExperience>,
    @InjectRepository(ProfileSkill)
    private readonly skillRepo: Repository<ProfileSkill>,
    @Inject(STORAGE) private readonly storage: Storage,
    private readonly llm: LlmService,
  ) {
    super();
  }

  async process(job: Job<{ sourceId: string; userId: string }>): Promise<void> {
    const { sourceId, userId } = job.data;
    const source = await this.sourceRepo.findOne({ where: { id: sourceId } });
    if (!source) return;

    try {
      // Download file from S3
      const key = source.blobUri.replace(/^s3:\/\/[^/]+\//, '');
      const buffer = await this.storage.download(key);

      // Extract text
      let text = '';
      if (source.contentType === 'application/pdf') {
        const parsed = await pdfParse(buffer);
        text = parsed.text;
      } else if (source.contentType.includes('word') || source.filename.endsWith('.docx')) {
        const result = await mammoth.extractRawText({ buffer });
        text = result.value;
      } else {
        text = buffer.toString('utf8');
      }

      // LLM parse
      const prompt = `Parse this resume into structured JSON. Return ONLY valid JSON, no commentary.

Resume text:
${text.slice(0, 8000)}

Return JSON matching this schema:
{
  "basicInfo": { "fullName": string, "email": string, "phone": string, "location": string, "linkedinUrl": string },
  "education": [{ "school": string, "degree": string, "major": string, "start": "YYYY-MM", "end": "YYYY-MM", "gpa": string }],
  "workExperience": [{ "company": string, "title": string, "location": string, "start": "YYYY-MM", "end": "YYYY-MM", "bullets": [string] }],
  "skills": [{ "name": string, "kind": "HARD"|"SOFT"|"TOOL" }]
}`;

      const raw = await this.llm.complete(MODEL_PARSE, [
        { role: 'system', content: 'You parse resumes into structured JSON. Output only valid JSON.' },
        { role: 'user', content: prompt },
      ]);

      let parsed: ParsedResume;
      try {
        const jsonMatch = raw.match(/\{[\s\S]*\}/);
        parsed = jsonMatch ? (JSON.parse(jsonMatch[0]) as ParsedResume) : { basicInfo: {}, education: [], workExperience: [], skills: [] };
      } catch {
        throw new Error(`Failed to parse LLM response as JSON: ${raw.slice(0, 200)}`);
      }

      // Upsert profile and related entities
      await this.profileRepo.upsert(
        { userId, basicInfo: parsed.basicInfo, lastResumeUploadedAt: new Date() },
        ['userId'],
      );

      if (parsed.education?.length) {
        const edu = parsed.education.map((e) => this.eduRepo.create({ id: ulid(), userId, ...e }));
        await this.eduRepo.save(edu);
      }

      if (parsed.workExperience?.length) {
        const exp = parsed.workExperience.map((e) =>
          this.expRepo.create({ id: ulid(), userId, ...e }),
        );
        await this.expRepo.save(exp);
      }

      if (parsed.skills?.length) {
        const skills = parsed.skills.map((s) => this.skillRepo.create({ id: ulid(), userId, ...s }));
        await this.skillRepo.save(skills);
      }

      source.parseStatus = 'DONE';
      await this.sourceRepo.save(source);
      this.logger.log(`Resume parsed for user ${userId}`);
    } catch (err) {
      source.parseStatus = 'FAILED';
      source.parseError = String(err);
      await this.sourceRepo.save(source);
      this.logger.error(`Resume parse failed for ${sourceId}`, err);
      throw err;
    }
  }
}
