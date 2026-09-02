import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../base.entity.js';

@Entity('followup_emails')
export class FollowupEmail extends BaseEntity {
  @Index()
  @Column({ type: 'varchar', length: 26 })
  userId: string;

  @Column({ type: 'varchar', length: 20, default: 'gmail-web' })
  source: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  subject: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  fromAddr: string | null;

  /** AES-256-GCM encrypted bytes (nonce[12] + ciphertext + tag[16]). §12.1 */
  @Column({ type: 'bytea', nullable: true })
  bodyText: Buffer | null;

  @Column({ type: 'varchar', length: 30, nullable: true })
  kind: string | null; // INTERVIEW_INVITE | REJECTION | HR_FOLLOWUP | TEMPLATE_REJECTION

  @Column({ type: 'jsonb', nullable: true })
  parsed: Record<string, unknown> | null;

  @Column({ type: 'varchar', length: 26, nullable: true })
  radarItemId: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  receivedAt: Date | null;
}
