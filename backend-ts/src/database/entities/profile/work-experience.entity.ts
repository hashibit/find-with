import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../base.entity.js';

@Entity('profile_work_experiences')
export class ProfileWorkExperience extends BaseEntity {
  @Index()
  @Column({ type: 'varchar', length: 26 })
  userId: string;

  @Column({ type: 'varchar', length: 255 })
  company: string;

  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  location: string | null;

  @Column({ type: 'varchar', length: 7, nullable: true })
  start: string | null;

  @Column({ type: 'varchar', length: 7, nullable: true })
  end: string | null;

  // Explicit current-job flag. Using end === null is unreliable because end may be
  // null when the date is simply unknown rather than because the role is ongoing.
  @Column({ type: 'boolean', default: false })
  isCurrent: boolean;

  @Column({ type: 'boolean', nullable: true })
  isRemote: boolean | null;

  // FULL_TIME | PART_TIME | CONTRACT | INTERNSHIP | FREELANCE
  @Column({ type: 'varchar', length: 20, nullable: true })
  employmentType: string | null;

  @Column({ type: 'jsonb', nullable: true })
  bullets: string[] | null;

  @Column({ type: 'jsonb', nullable: true })
  linkedMaterialIds: string[] | null;
}
