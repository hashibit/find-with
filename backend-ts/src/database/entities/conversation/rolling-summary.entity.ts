import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../base.entity.js';

@Entity('conv_rolling_summary')
export class ConvRollingSummary extends BaseEntity {
  @Index()
  @Column({ type: 'varchar', length: 26 })
  conversationId: string;

  @Column({ type: 'varchar', length: 26 })
  start_message_id: string;

  @Column({ type: 'varchar', length: 26 })
  end_message_id: string;

  @Column({ type: 'text', nullable: true })
  content: string | null;
}
