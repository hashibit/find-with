import { Column, Entity } from 'typeorm';
import { UserOwnedSingletonEntity } from '../base.entity';

@Entity('quota_usage_counters')
export class QuotaUsageCounter extends UserOwnedSingletonEntity {
  @Column({ type: 'int', default: 0 })
  tailoringCompleted: number;

  @Column({ type: 'int', default: 3 })
  tailoringLimit: number; // free=3, pro=unlimited (set to 999999)

  @Column({ type: 'timestamptz', default: () => 'NOW()' })
  windowStart: Date;
}
