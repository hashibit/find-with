import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../base.entity';

@Entity('profile_resume_sources')
export class ProfileResumeSource extends BaseEntity {
  @Index()
  @Column({ type: 'varchar', length: 26 })
  userId: string;

  @Column({ type: 'varchar', length: 255 })
  filename: string;

  @Column({ type: 'varchar', length: 50 })
  contentType: string;

  @Column({ type: 'text' })
  blobUri: string;

  @Column({ type: 'varchar', length: 20, default: 'PENDING' })
  parseStatus: string; // PENDING | DONE | FAILED

  @Column({ type: 'text', nullable: true })
  parseError: string | null;

  @Column({ type: 'timestamptz', default: () => 'NOW()' })
  uploadedAt: Date;
}
