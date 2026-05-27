import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../base.entity';

@Entity('tailoring_snapshots')
export class TailoringSnapshot extends BaseEntity {
  @Index()
  @Column({ type: 'varchar', length: 26 })
  tailoredResumeId: string;

  @Column({ type: 'text', nullable: true })
  blobUriPdf: string | null;

  @Column({ type: 'text', nullable: true })
  plainText: string | null;

  @Column({ type: 'timestamptz', default: () => 'NOW()' })
  frozenAt: Date;
}
