import { Column, Entity, OneToMany } from 'typeorm';
import { UserOwnedSingletonEntity } from '../base.entity.js';
import { ProfileWorkExperience } from './work-experience.entity.js';
import { ProfileEducation } from './education.entity.js';
import { ProfileSkill } from './skill.entity.js';

@Entity('profile_profiles')
export class ProfileProfile extends UserOwnedSingletonEntity {
  @Column({ type: 'jsonb', nullable: true })
  basicInfo: Record<string, unknown> | null;

  @Column({ type: 'jsonb', nullable: true })
  certifications: unknown[] | null;

  @Column({ type: 'timestamptz', nullable: true })
  lastResumeUploadedAt: Date | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  etag: string | null;

  @Column({ type: 'timestamptz', default: () => 'NOW()' })
  createdAt: Date;

  @Column({ type: 'timestamptz', default: () => 'NOW()', onUpdate: 'NOW()' })
  updatedAt: Date;

  @OneToMany(() => ProfileWorkExperience, (exp) => exp.userId)
  workExperience: ProfileWorkExperience[];

  @OneToMany(() => ProfileEducation, (edu) => edu.userId)
  education: ProfileEducation[];

  @OneToMany(() => ProfileSkill, (skill) => skill.userId)
  skills: ProfileSkill[];
}
