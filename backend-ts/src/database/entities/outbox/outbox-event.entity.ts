import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../base.entity';

@Entity('outbox_events')
export class OutboxEvent extends BaseEntity {
  @Column({ type: 'varchar', length: 100 })
  eventType: string;

  @Column({ type: 'jsonb', nullable: true })
  payload: Record<string, unknown> | null;

  @Index()
  @Column({ type: 'varchar', length: 50 })
  consumerGroup: string; // agent | billing | telemetry

  @Column({ type: 'timestamptz', nullable: true })
  dispatchedAt: Date | null;
}
