import { BeforeInsert, Column, Entity, Index, PrimaryColumn } from 'typeorm';
import { ulid } from 'ulid';

@Entity('quota_consume_log')
export class QuotaConsumeLog {
  @PrimaryColumn({ type: 'varchar', length: 26 })
  id: string;

  @Index()
  @Column({ type: 'varchar', length: 26 })
  userId: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 26 })
  tailoredResumeId: string; // UNIQUE prevents double-charge on retry

  @Column({ type: 'timestamptz', default: () => 'NOW()' })
  consumedAt: Date;

  @BeforeInsert()
  generateId(): void {
    if (!this.id) {
      this.id = ulid();
    }
  }
}
