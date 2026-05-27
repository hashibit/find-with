import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../base.entity.js';

@Entity('conv_conversations')
export class ConvConversation extends BaseEntity {
  @Index()
  @Column({ type: 'varchar', length: 26 })
  userId: string;

  @Column({ type: 'varchar', length: 30 })
  kind: string; // FREE_CHAT | ONBOARDING | JOB_ANALYSIS | GAP_MINING | TAILOR_EDIT | FOLLOWUP

  @Column({ type: 'varchar', length: 26, nullable: true })
  anchorId: string | null; // radar_item_id or other domain anchor

  @Column({ type: 'varchar', length: 20, default: 'BALANCED' })
  effectiveDensity: string;

  @Column({ type: 'timestamptz', default: () => 'NOW()' })
  lastActivity: Date;

  @Column({ type: 'text', nullable: true })
  rollingSummary: string | null;

  @Column({ type: 'jsonb', nullable: true })
  importantQuotes: unknown[] | null;
}
