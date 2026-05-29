import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../base.entity.js';

@Entity('conv_messages')
export class ConvMessage extends BaseEntity {
  @Index()
  @Column({ type: 'varchar', length: 26 })
  conversationId: string;

  @Column({ type: 'varchar', length: 20 })
  role: string; // USER | ASSISTANT | SYSTEM | TOOL

  @Column({ type: 'text', nullable: true })
  text: string | null;

  @Column({ type: 'jsonb', nullable: true })
  toolCalls: unknown[] | null;

  @Column({ type: 'jsonb', nullable: true })
  toolResult: Record<string, unknown> | null;

  @Column({ type: 'int', nullable: true })
  tokenPrompt: number | null;

  @Column({ type: 'int', nullable: true })
  tokenCompletion: number | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  tokenModel: string | null;

  @Column({ type: 'float', nullable: true })
  tokenCostUsd: number | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  finishReason: string | null;

  @Column({ type: 'jsonb', nullable: true })
  meta: Record<string, unknown> | null;

  @Column({ type: 'boolean', default: false })
  archived: boolean;
}
