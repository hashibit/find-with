import { Column, Entity } from 'typeorm';
import { BaseEntity } from '../base.entity.js';

@Entity('pending_tool_results')
export class PendingToolResult extends BaseEntity {
  @Column({ type: 'varchar', length: 26, nullable: false })
  conversationId: string;

  @Column({ type: 'varchar', length: 100, nullable: false })
  toolName: string;

  @Column({ type: 'varchar', length: 26, nullable: false })
  toolCallId: string;

  @Column({ type: 'jsonb', nullable: true })
  result: Record<string, unknown> | null;

  @Column({ type: 'jsonb', nullable: true })
  error: Record<string, unknown> | null;

  @Column({ type: 'boolean', default: false })
  acknowledged: boolean;
}
