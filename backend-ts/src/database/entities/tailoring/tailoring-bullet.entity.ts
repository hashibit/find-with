import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../base.entity.js';

export enum BulletStatus {
  PENDING = 'PENDING',
  CONFIRMED = 'CONFIRMED',
  USER_EDITED = 'USER_EDITED',
}

@Entity('tailoring_bullets')
export class TailoringBullet extends BaseEntity {
  @Index()
  @Column({ type: 'varchar', length: 26 })
  resumeId: string;

  @Column({ type: 'varchar', length: 255 })
  sectionTitle: string;

  @Column({ type: 'int' })
  position: number;

  @Column({ type: 'text' })
  text: string;

  @Column({ type: 'varchar', length: 30 })
  source: string;

  @Column({ type: 'varchar', length: 26, nullable: true })
  sourceId: string | null;

  @Column({ type: 'varchar', length: 30, default: BulletStatus.PENDING })
  status: BulletStatus;
}
