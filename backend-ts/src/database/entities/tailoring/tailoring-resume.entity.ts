import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../base.entity';

@Entity('tailoring_resumes')
export class TailoringResume extends BaseEntity {
  @Index()
  @Column({ type: 'varchar', length: 26 })
  userId: string;

  @Column({ type: 'varchar', length: 26 })
  baseResumeId: string;

  @Column({ type: 'varchar', length: 26 })
  parsedJdId: string;

  @Column({ type: 'jsonb', nullable: true })
  sections: unknown[] | null;

  @Column({ type: 'float', nullable: true })
  matchBefore: number | null;

  @Column({ type: 'float', nullable: true })
  matchAfter: number | null;
}
