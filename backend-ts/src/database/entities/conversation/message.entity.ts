import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../base.entity.js';

@Entity('conv_messages')
export class ConvMessage extends BaseEntity {
  @Index()
  @Column({ type: 'varchar', length: 26 })
  conversationId: string;

  @Column({ type: 'varchar', length: 20 })
  role: string; // USER | ASSISTANT | TOOL_RESULT

  // Extracted text for display / search. Null for non-text messages.
  @Column({ type: 'text', nullable: true })
  text: string | null;

  // Full pi-ai Message object. Null only for legacy USER messages.
  @Column({ type: 'jsonb', nullable: true })
  payload: unknown | null;

  @Column({ type: 'boolean', default: false })
  archived: boolean;
}
