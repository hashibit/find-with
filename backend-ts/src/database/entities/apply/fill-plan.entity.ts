import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../base.entity.js';

@Entity('apply_fill_plans')
export class ApplyFillPlan extends BaseEntity {
  @Column({ type: 'varchar', length: 26 })
  radarItemId: string;

  @Index()
  @Column({ type: 'varchar', length: 26 })
  userId: string;

  @Column({ type: 'jsonb', nullable: true })
  fields: unknown[] | null;

  @Column({ type: 'varchar', length: 2000, nullable: true })
  previewSummary: string | null;

  @Column({ type: 'boolean', default: false })
  userApproved: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  approvedAt: Date | null;
}
