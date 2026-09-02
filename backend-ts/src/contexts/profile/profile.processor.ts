import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, Inject } from '@nestjs/common';
import { Job } from 'bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { extractText } from 'unpdf';
import * as mammoth from 'mammoth';
import { Type, type Static } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';
import { ProfileResumeSource } from '../../database/entities/profile/resume-source.entity.js';
import { ProfileProfile } from '../../database/entities/profile/profile.entity.js';
import { ProfileEducation } from '../../database/entities/profile/education.entity.js';
import { ProfileWorkExperience } from '../../database/entities/profile/work-experience.entity.js';
import { ProfileSkill } from '../../database/entities/profile/skill.entity.js';
import { ProfileBaseResume } from '../../database/entities/profile/base-resume.entity.js';
import { STORAGE, type Storage } from '../../adapters/storage/storage.interface.js';
import { LLM_PROVIDER, type LlmProvider } from '../../llm/llm-provider.interface.js';
import { RESUME_PARSE_QUEUE } from './profile.service.js';
import { parseMonthDate } from './month-date.js';
import { ulid } from 'ulid';

// LLMs emit null for absent dates far more often than omitting the key —
// accept both, normalizeMonthDate turns null into a clean absent date.
const MonthDate = Type.Optional(Type.Union([Type.String(), Type.Null()]));

const ParsedResumeSchema = Type.Object({
  basicInfo: Type.Object({
    fullName: Type.Optional(Type.String()),
    email: Type.Optional(Type.String()),
    phone: Type.Optional(Type.String()),
    location: Type.Optional(Type.String()),
    linkedinUrl: Type.Optional(Type.String()),
  }),
  education: Type.Array(
    Type.Object({
      school: Type.String(),
      degree: Type.Optional(Type.String()),
      major: Type.Optional(Type.String()),
      start: Type.Optional(MonthDate),
      end: Type.Optional(MonthDate),
      isCurrentlyEnrolled: Type.Optional(Type.Boolean()),
      gpa: Type.Optional(Type.String()),
    }),
  ),
  workExperience: Type.Array(
    Type.Object({
      company: Type.String(),
      title: Type.String(),
      location: Type.Optional(Type.String()),
      start: Type.Optional(MonthDate),
      end: Type.Optional(MonthDate),
      isCurrent: Type.Optional(Type.Boolean()),
      bullets: Type.Array(Type.String()),
    }),
  ),
  skills: Type.Array(
    Type.Object({
      name: Type.String(),
      kind: Type.Union([Type.Literal('HARD'), Type.Literal('SOFT'), Type.Literal('TOOL')]),
    }),
  ),
});

type ParsedResume = Static<typeof ParsedResumeSchema>;

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
    @InjectRepository(ProfileBaseResume)
    private readonly baseResumeRepo: Repository<ProfileBaseResume>,
    @Inject(STORAGE) private readonly storage: Storage,
    @Inject(LLM_PROVIDER) private readonly llm: LlmProvider,
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
        const { text: merged } = await extractText(new Uint8Array(buffer), { mergePages: true });
        text = merged;
      } else if (source.contentType.includes('word') || source.filename.endsWith('.docx')) {
        const result = await mammoth.extractRawText({ buffer });
        text = result.value;
      } else {
        text = buffer.toString('utf8');
      }

      // LLM parse with structured output
      const prompt = `Parse this resume into structured data.

Date rules: every start/end must be exactly "YYYY-MM". Convert formats like "March 2020", "2020.03" or "2020-03-15". If only a year is known, use "YYYY-01". For an ongoing role/education, omit end and set isCurrent/isCurrentlyEnrolled to true. Never write "Present" into end.

Resume text:
${text.slice(0, 8000)}`;

      const result = await this.llm.structuredComplete(
        {
          systemPrompt: 'You parse resumes into structured data.',
          messages: [{ role: 'user', content: prompt, timestamp: Date.now() }],
        },
        ParsedResumeSchema,
      );

      // Runtime validation — constrainedSampling guarantees valid output,
      // but Check is a defensive safety net in case the LLM provider makes mistakes.
      if (!Value.Check(ParsedResumeSchema, result)) {
        const errors = [...Value.Errors(ParsedResumeSchema, result)];
        throw new Error(
          `LLM structured output validation failed: ${errors.map((e) => e.message).join('; ')}`,
        );
      }

      const parsed = result;

      // Upsert profile and related entities
      await this.profileRepo.upsert(
        { userId, basicInfo: parsed.basicInfo, lastResumeUploadedAt: new Date() },
        ['userId'],
      );

      if (parsed.education?.length) {
        const edu = parsed.education.map((e) => {
          const start = parseMonthDate(e.start);
          const end = parseMonthDate(e.end);
          return this.eduRepo.create({
            id: ulid(),
            userId,
            ...e,
            start: start.date,
            end: end.date,
            // "Present"-style end or an explicit LLM flag marks enrollment as ongoing
            isCurrentlyEnrolled: e.isCurrentlyEnrolled ?? end.isPresent,
          });
        });
        await this.eduRepo.save(edu);
      }

      if (parsed.workExperience?.length) {
        const exp = parsed.workExperience.map((e) => {
          const start = parseMonthDate(e.start);
          const end = parseMonthDate(e.end);
          return this.expRepo.create({
            id: ulid(),
            userId,
            ...e,
            start: start.date,
            end: end.date,
            isCurrent: e.isCurrent ?? end.isPresent,
          });
        });
        await this.expRepo.save(exp);
      }

      if (parsed.skills?.length) {
        const skills = parsed.skills.map((s) =>
          this.skillRepo.create({ id: ulid(), userId, ...s }),
        );
        await this.skillRepo.save(skills);
      }

      // Auto-create a default base resume if none exists yet
      const existingBase = await this.baseResumeRepo.findOne({ where: { userId } });
      if (!existingBase) {
        await this.baseResumeRepo.save(
          this.baseResumeRepo.create({ id: ulid(), userId, name: 'Default', isDefault: true }),
        );
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
