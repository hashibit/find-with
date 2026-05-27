import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../base.entity.js';

@Entity('idempotency_keys')
export class IdempotencyKey extends BaseEntity {
  @Index()
  @Column({ type: 'varchar', length: 26 })
  userId: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 255 })
  key: string;

  @Column({ type: 'int' })
  statusCode: number;

  @Column({ type: 'jsonb', nullable: true })
  responseBody: unknown | null;

  @Column({ type: 'timestamptz' })
  expiresAt: Date;
}
