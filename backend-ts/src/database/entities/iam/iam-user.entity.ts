import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../base.entity.js';

@Entity('iam_users')
export class IamUser extends BaseEntity {
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 255 })
  clerkUserId: string;

  @Column({ type: 'varchar', length: 255 })
  email: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  fullName: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  deletedAt: Date | null;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;
}
