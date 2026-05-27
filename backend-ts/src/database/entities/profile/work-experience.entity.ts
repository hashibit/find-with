import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../base.entity';

@Entity('profile_work_experiences')
export class ProfileWorkExperience extends BaseEntity {
  @Index()
  @Column({ type: 'varchar', length: 26 })
  userId: string;

  @Column({ type: 'varchar', length: 255 })
  company: string;

  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  location: string | null;

  @Column({ type: 'varchar', length: 7, nullable: true })
  start: string | null;

  @Column({ type: 'varchar', length: 7, nullable: true })
  end: string | null;

  @Column({ type: 'jsonb', nullable: true })
  bullets: string[] | null;

  @Column({ type: 'jsonb', nullable: true })
  linkedMaterialIds: string[] | null;
}
