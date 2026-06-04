import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../base.entity.js';

@Entity('admin_audit_logs')
@Index(['action', 'createdAt'])
@Index(['targetId'])
export class AuditLog extends BaseEntity {
  @Column({ type: 'varchar', length: 100 })
  action: string;

  @Column({ type: 'varchar', length: 255 })
  targetId: string;

  @Column({ type: 'text', nullable: true })
  note: string | null;
}
