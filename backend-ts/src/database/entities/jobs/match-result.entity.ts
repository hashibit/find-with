import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../base.entity.js';

@Entity('jobs_match_results')
export class JobMatchResult extends BaseEntity {
  @Index()
  @Column({ type: 'varchar', length: 26 })
  parsedJdId: string;

  @Index()
  @Column({ type: 'varchar', length: 26 })
  userId: string;

  @Column({ type: 'float', nullable: true })
  surfaceScore: number | null;

  @Column({ type: 'float', nullable: true })
  deepScore: number | null;

  @Column({ type: 'jsonb', nullable: true })
  gaps: unknown[] | null;

  @Column({ type: 'jsonb', nullable: true })
  hitsSurface: unknown[] | null;

  @Column({ type: 'jsonb', nullable: true })
  hitsDeep: unknown[] | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  overallAdvice: string | null; // APPLY | SKIP | CAUTIOUS

  @Column({ type: 'text', nullable: true })
  adviceRationale: string | null;
}
