import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../base.entity';

@Entity('followup_drafts')
export class FollowupDraft extends BaseEntity {
  @Index()
  @Column({ type: 'varchar', length: 26 })
  emailId: string;

  @Column({ type: 'varchar', length: 26 })
  userId: string;

  @Column({ type: 'text', nullable: true })
  text: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  intent: string | null;
}
