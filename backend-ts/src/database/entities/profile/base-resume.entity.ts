import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../base.entity.js';

@Entity('profile_base_resumes')
export class ProfileBaseResume extends BaseEntity {
  @Index()
  @Column({ type: 'varchar', length: 26 })
  userId: string;

  @Column({ type: 'varchar', length: 100, default: 'Default' })
  name: string;

  @Column({ type: 'jsonb', nullable: true })
  selectedMaterialIds: string[] | null;

  @Column({ type: 'boolean', default: true })
  isDefault: boolean;
}
