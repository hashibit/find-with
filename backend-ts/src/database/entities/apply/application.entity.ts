import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../base.entity';

@Entity('apply_applications')
export class ApplyApplication extends BaseEntity {
  @Index()
  @Column({ type: 'varchar', length: 26 })
  userId: string;

  @Column({ type: 'varchar', length: 26 })
  radarItemId: string;

  @Column({ type: 'varchar', length: 26, nullable: true })
  resumeSnapshotId: string | null;

  @Column({ type: 'timestamptz', default: () => 'NOW()' })
  submittedAt: Date;
}
