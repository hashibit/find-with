import { Column, Entity } from 'typeorm';
import { BaseEntity } from '../base.entity.js';

export enum PurgeSagaStep {
  INITIATED = 'INITIATED',
  STRIPE_DELETED = 'STRIPE_DELETED',
  CLERK_DELETED = 'CLERK_DELETED',
  DATA_DELETED = 'DATA_DELETED',
  COMPLETED = 'COMPLETED',
  DEAD_LETTER = 'DEAD_LETTER',
}

@Entity('iam_account_purge_sagas')
export class AccountPurgeSaga extends BaseEntity {
  @Column({ type: 'varchar', length: 26 })
  userId: string;

  @Column({ type: 'varchar', length: 50, default: PurgeSagaStep.INITIATED })
  step: string;

  @Column({ type: 'timestamptz', nullable: true })
  expiresAt: Date | null;

  @Column({ type: 'boolean', default: false })
  cancelled: boolean;

  @Column({ type: 'jsonb', nullable: true })
  stepResults: Record<string, unknown> | null;

  @Column({ type: 'text', nullable: true })
  deadLetterRunbookUrl: string | null;

  @Column({ type: 'text', nullable: true })
  errorMessage: string | null;
}
