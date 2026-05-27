import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../base.entity';

@Entity('reco_recommendations')
export class RecoRecommendation extends BaseEntity {
  @Index()
  @Column({ type: 'varchar', length: 26 })
  userId: string;

  @Column({ type: 'jsonb', nullable: true })
  items: unknown[] | null;

  @Column({ type: 'timestamptz', nullable: true })
  sentAt: Date | null;

  @Column({ type: 'jsonb', nullable: true })
  feedback: Record<string, unknown> | null;
}
