import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../base.entity';

@Entity('jobs_captures')
export class JobCapture extends BaseEntity {
  @Index()
  @Column({ type: 'varchar', length: 26 })
  userId: string;

  @Column({ type: 'varchar', length: 20 })
  source: string; // linkedin | indeed | company_careers

  @Column({ type: 'text' })
  sourceUrl: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  sourceJobId: string | null;

  @Column({ type: 'text', nullable: true })
  capturedHtml: string | null;

  @Column({ type: 'text', nullable: true })
  capturedText: string | null;

  @Column({ type: 'jsonb', nullable: true })
  meta: Record<string, unknown> | null;

  @Column({ type: 'timestamptz', default: () => 'NOW()' })
  capturedAt: Date;
}
