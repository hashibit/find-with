import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../base.entity.js';

@Entity('profile_projects')
export class ProfileProject extends BaseEntity {
  @Index()
  @Column({ type: 'varchar', length: 26 })
  userId: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'varchar', length: 7, nullable: true })
  start: string | null;

  @Column({ type: 'varchar', length: 7, nullable: true })
  end: string | null;

  @Column({ type: 'jsonb', nullable: true })
  linkedMaterialIds: string[] | null;
}
