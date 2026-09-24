import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../base.entity.js';

/**
 * One persisted tool invocation: arguments + result, atomic per row.
 * Paired to its ASSISTANT conv_messages row via assistantId — replay
 * reassembly never depends on row order.
 * Design record: docs/tech/conv-messages-restructure.md
 */
@Index('UQ_conv_tool_calls_conversation_call', ['conversationId', 'toolCallId'], { unique: true })
@Entity('conv_tool_calls')
export class ConvToolCall extends BaseEntity {
  @Index()
  @Column({ type: 'varchar', length: 26 })
  conversationId: string;

  // The ASSISTANT conv_messages row this invocation belongs to.
  @Index()
  @Column({ type: 'varchar', length: 26 })
  assistantId: string;

  // Provider tool-call id (SSE correlation / debugging).
  @Index()
  @Column({ type: 'varchar', length: 255 })
  toolCallId: string;

  // Plaintext — tool names are a fixed vocabulary, not user content.
  @Column({ type: 'varchar', length: 255 })
  toolName: string;

  // Order among the assistant turn's calls.
  @Column({ type: 'int' })
  seq: number;

  // PII — JSON.stringify of the pi-ai ToolCall arguments.
  @Column({ type: 'bytea' })
  encryptedArguments: Buffer;

  // PII — tool result text.
  @Column({ type: 'bytea', nullable: true })
  encryptedResult: Buffer | null;

  @Column({ type: 'boolean' })
  isError: boolean;

  @Column({ type: 'varchar', length: 20, default: 'SUCCEEDED' })
  status: 'PROCESSING' | 'SUCCEEDED' | 'FAILED';
}
