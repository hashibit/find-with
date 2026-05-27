import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../base.entity';

@Entity('profile_education')
export class ProfileEducation extends BaseEntity {
  @Index()
  @Column({ type: 'varchar', length: 26 })
  userId: string;

  @Column({ type: 'varchar', length: 255 })
  school: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  degree: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  major: string | null;

  @Column({ type: 'varchar', length: 7, nullable: true })
  start: string | null; // YYYY-MM

  @Column({ type: 'varchar', length: 7, nullable: true })
  end: string | null;

  @Column({ type: 'varchar', length: 10, nullable: true })
  gpa: string | null;

  @Column({ type: 'jsonb', nullable: true })
  highlights: string[] | null;
}
