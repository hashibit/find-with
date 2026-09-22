import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../base.entity.js';

/** role = conversation speaker. Tool invocations live in conv_tool_calls. */
export type ConvMessageRole = 'USER' | 'ASSISTANT';

@Index('UQ_conv_messages_client_msg', ['conversationId', 'clientMessageId'], { unique: true })
@Entity('conv_messages')
export class ConvMessage extends BaseEntity {
  @Index()
  @Column({ type: 'varchar', length: 26 })
  conversationId: string;

  // Client-generated id (USER rows only) — send-side idempotency key. SSE
  // re-sends of the same prompt carry the same messageId and collapse to the
  // original row via UQ_conv_messages_client_msg. Null for ASSISTANT rows.
  @Column({ type: 'varchar', length: 64, nullable: true })
  clientMessageId: string | null;

  @Column({ type: 'varchar', length: 20 })
  role: ConvMessageRole;

  // Encrypted chat content (AES-256-GCM: nonce[12] + ciphertext + tag[16]).
  // USER: the user's input. ASSISTANT: the assistant's text blocks joined.
  // Design record: docs/tech/conv-messages-restructure.md
  @Column({ type: 'bytea', nullable: true })
  encryptedText: Buffer | null;

  // ASSISTANT only: encrypted thinking blocks JSON
  // [{thinking, thinkingSignature?, redacted?}]. thinkingSignature is
  // load-bearing — Anthropic replay of tool-call turns requires the original
  // thinking blocks with their signatures intact.
  @Column({ type: 'bytea', nullable: true })
  encryptedThinking: Buffer | null;

  // Plaintext, non-sensitive: {provider, model, responseId?, stopReason,
  // errorMessage?}. No user content, no usage — token estimation uses content
  // lengths at read time; exact numbers live in token_usage_logs.
  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @Column({ type: 'boolean', default: false })
  archived: boolean;
}
