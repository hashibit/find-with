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

  // Encrypted text using AES-256-GCM. For PII protection. The `text` column
  // stays NULL on write; plaintext exists only after decryption (display view).
  @Column({ type: 'bytea', nullable: true })
  encryptedText: Buffer | null;

  // Full pi-ai Message object. Null for USER messages (their plaintext lives
  // only in encryptedText); populated for ASSISTANT and TOOL_RESULT rows.
  @Column({ type: 'jsonb', nullable: true })
  payload: unknown | null;

  @Column({ type: 'boolean', default: false })
  archived: boolean;
}
