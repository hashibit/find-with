import { Column, Entity } from 'typeorm';
import { BaseEntity } from '../base.entity.js';

@Entity('gdpr_purge_log')
export class GdprPurgeLog extends BaseEntity {
  @Column({ type: 'varchar', length: 26 })
  userId: string;

  @Column({ type: 'timestamptz' })
  purgedAt: Date;

  @Column({ type: 'jsonb', nullable: true })
  deletedRowCounts: Record<string, number> | null;
}
