import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../base.entity.js';

@Entity('jobs_company_briefs')
export class JobCompanyBrief extends BaseEntity {
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 255 })
  company: string;

  @Column({ type: 'text', nullable: true })
  whatTheyDo: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  sizeStage: string | null;

  @Column({ type: 'jsonb', nullable: true })
  recentNews: unknown[] | null;

  @Column({ type: 'jsonb', nullable: true })
  risks: Record<string, unknown> | null;

  @Column({ type: 'float', nullable: true })
  glassdoorRating: number | null;

  @Column({ type: 'timestamptz', default: () => 'NOW()' })
  generatedAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  ttlExpires: Date | null;
}
