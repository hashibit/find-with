import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../base.entity';

@Entity('billing_subscriptions')
export class BillingSubscription extends BaseEntity {
  @Index()
  @Column({ type: 'varchar', length: 26 })
  userId: string;

  @Column({ type: 'varchar', length: 20, default: 'FREE' })
  tier: string; // FREE | PRO | PRO_PLUS

  @Column({ type: 'varchar', length: 20, default: 'ACTIVE' })
  state: string; // ACTIVE | PAUSED | CANCELLED

  @Column({ type: 'varchar', length: 255, nullable: true })
  stripeCustomerId: string | null;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 255, nullable: true })
  stripeSubscriptionId: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  periodEnd: Date | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  pausedReason: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  lastEventId: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  lastEventAt: Date | null;
}
