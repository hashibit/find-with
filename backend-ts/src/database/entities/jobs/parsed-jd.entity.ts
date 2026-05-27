import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../base.entity.js';

@Entity('jobs_parsed_jds')
export class JobParsedJd extends BaseEntity {
  @Index()
  @Column({ type: 'varchar', length: 26 })
  captureId: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  title: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  company: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  location: string | null;

  @Column({ type: 'jsonb', nullable: true })
  hardSkills: string[] | null;

  @Column({ type: 'jsonb', nullable: true })
  softSkills: string[] | null;

  @Column({ type: 'jsonb', nullable: true })
  experience: Record<string, unknown> | null;

  @Column({ type: 'jsonb', nullable: true })
  educationRequired: Record<string, unknown> | null;

  @Column({ type: 'jsonb', nullable: true })
  hiddenSignals: string[] | null;

  @Column({ type: 'jsonb', nullable: true })
  niceToHave: string[] | null;

  @Column({ type: 'text', nullable: true })
  buzzwordTranslation: string | null;

  @Column({ type: 'timestamptz', default: () => 'NOW()' })
  parsedAt: Date;

  /** pgvector 1536-dim embedding stored as jsonb fallback */
  @Column({ type: 'jsonb', nullable: true })
  jdEmbedding: number[] | null;
}
