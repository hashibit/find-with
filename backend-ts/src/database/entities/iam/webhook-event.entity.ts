import { Column, Entity, Unique } from 'typeorm';
import { BaseEntity } from '../base.entity.js';

@Entity('iam_webhook_events')
@Unique(['provider', 'eventId'])
export class IamWebhookEvent extends BaseEntity {
  @Column({ type: 'varchar', length: 50 })
  provider: string; // 'stripe' | 'clerk'

  @Column({ type: 'varchar', length: 255 })
  eventId: string;

  @Column({ type: 'varchar', length: 100 })
  eventType: string;

  @Column({ type: 'timestamptz', default: () => 'NOW()' })
  processedAt: Date;
}
