import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../base.entity.js';

@Entity('jobs_radar_items')
export class JobRadarItem extends BaseEntity {
  @Index()
  @Column({ type: 'varchar', length: 26 })
  userId: string;

  @Column({ type: 'varchar', length: 26, nullable: true })
  captureId: string | null;

  @Column({ type: 'varchar', length: 26, nullable: true })
  parsedJdId: string | null;

  @Column({ type: 'varchar', length: 26, nullable: true })
  matchId: string | null;

  @Column({ type: 'varchar', length: 26, nullable: true })
  resumeSnapshotId: string | null;

  /**
   * State machine: BROWSED → ANALYZED → DECIDED → APPLIED
   *   → INTERVIEWING → OFFER_RECEIVED → OFFER_ACCEPTED | OFFER_REJECTED
   *   (also DECIDED_NO from ANALYZED)
   */
  @Column({ type: 'varchar', length: 30, default: 'BROWSED' })
  status: string;

  @Column({ type: 'timestamptz', default: () => 'NOW()' })
  lastStatusAt: Date;

  @Column({ type: 'text', nullable: true })
  userDecisionNote: string | null;
}
