import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../base.entity';

@Entity('telemetry_events')
export class TelemetryEvent extends BaseEntity {
  @Column({ type: 'varchar', length: 100 })
  eventType: string;

  @Index()
  @Column({ type: 'varchar', length: 26, nullable: true })
  userId: string | null;

  @Column({ type: 'jsonb', nullable: true })
  payload: Record<string, unknown> | null;
}
