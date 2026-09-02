import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Type } from '@sinclair/typebox';
import { ProfileProfile } from '../../database/entities/profile/profile.entity.js';
import { ProfileWorkExperience } from '../../database/entities/profile/work-experience.entity.js';
import { ProfileEducation } from '../../database/entities/profile/education.entity.js';
import { ProfileSkill } from '../../database/entities/profile/skill.entity.js';

import type { ToolExecutor } from '../tool-registry.js';

export const GET_PROFILE_TOOL_NAME = 'get_profile';

@Injectable()
export class GetProfileTool implements ToolExecutor {
  constructor(
    @InjectRepository(ProfileProfile)
    private readonly profileRepo: Repository<ProfileProfile>,
    @InjectRepository(ProfileWorkExperience)
    private readonly workExpRepo: Repository<ProfileWorkExperience>,
    @InjectRepository(ProfileEducation)
    private readonly educationRepo: Repository<ProfileEducation>,
    @InjectRepository(ProfileSkill)
    private readonly skillRepo: Repository<ProfileSkill>,
  ) {}

  readonly name = GET_PROFILE_TOOL_NAME;
  readonly scenes = ['ALL'] as const;
  readonly description =
    "Read the user's full structured profile: basic info, work experience, education, skills, and certifications. Use when you need facts from their resume (employers, titles, dates, skills) that are not in your context or the materials list.";
  readonly parameters = Type.Object({});

  async execute(
    _toolCallId: string,
    _params: Record<string, never>,
    context: { userId: string; conversationId: string },
  ): Promise<{ content: Array<{ type: 'text'; text: string }>; details: Record<string, unknown> }> {
    const profile = await this.profileRepo.findOne({ where: { userId: context.userId } });
    if (!profile) {
      return {
        content: [{ type: 'text', text: 'No profile found. The user has not uploaded a resume yet.' }],
        details: { found: false },
      };
    }

    // Related entities are stored in separate tables (no join defined on the entity)
    const [workExperience, education, skills] = await Promise.all([
      this.workExpRepo.find({ where: { userId: context.userId }, order: { createdAt: 'DESC' } }),
      this.educationRepo.find({ where: { userId: context.userId }, order: { createdAt: 'DESC' } }),
      this.skillRepo.find({ where: { userId: context.userId }, order: { createdAt: 'DESC' } }),
    ]);

    const info = (profile.basicInfo ?? {}) as Record<string, unknown>;
    const sections: string[] = [];

    const infoLine = ['fullName', 'email', 'phone', 'location']
      .map((k) => (info[k] ? `${k}: ${String(info[k])}` : null))
      .filter(Boolean)
      .join(' | ');
    if (infoLine) sections.push(infoLine);

    if (workExperience.length) {
      const jobs = workExperience.map((w) => {
        const span = [w.start, w.end ?? (w.isCurrent ? 'present' : '?')].filter(Boolean).join(' → ');
        const meta = [w.employmentType, w.location, w.isRemote ? 'remote' : null]
          .filter(Boolean)
          .join(', ');
        const lines = [`- ${w.title} @ ${w.company}${span ? ` (${span})` : ''}${meta ? ` [${meta}]` : ''}`];
        for (const b of w.bullets ?? []) lines.push(`  - ${b}`);
        return lines.join('\n');
      });
      sections.push(`## Work experience\n${jobs.join('\n')}`);
    }

    if (education.length) {
      const schools = education.map((e) => {
        const span = [e.start, e.end ?? (e.isCurrentlyEnrolled ? 'enrolled' : '?')].filter(Boolean).join(' → ');
        const parts = [e.degree, e.major].filter(Boolean).join(', ');
        return `- ${e.school}${parts ? ` (${parts})` : ''}${span ? ` ${span}` : ''}${e.gpa ? ` GPA ${e.gpa}` : ''}`;
      });
      sections.push(`## Education\n${schools.join('\n')}`);
    }

    if (skills.length) {
      const byKind = new Map<string, string[]>();
      for (const s of skills) {
        const list = byKind.get(s.kind) ?? [];
        list.push(s.name);
        byKind.set(s.kind, list);
      }
      sections.push(
        `## Skills\n${Array.from(byKind.entries()).map(([kind, names]) => `${kind}: ${names.join(', ')}`).join('\n')}`,
      );
    }

    const certs = (profile.certifications ?? []) as Array<Record<string, unknown>>;
    if (certs.length) {
      sections.push(`## Certifications\n${certs.map((c) => `- ${String(c.name ?? JSON.stringify(c))}`).join('\n')}`);
    }

    const text = sections.length
      ? `User profile:\n\n${sections.join('\n\n')}`
      : 'Profile exists but has no structured sections filled in yet.';

    return {
      content: [{ type: 'text', text }],
      details: {
        found: true,
        counts: {
          workExperience: workExperience.length,
          education: education.length,
          skills: skills.length,
          certifications: certs.length,
        },
      },
    };
  }
}
