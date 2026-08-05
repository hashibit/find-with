import {
  Entity,
  Column,
  PrimaryColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';

/**
 * GuardrailLog records every input/output safety event.
 *
 * Each row captures one interception — either a blocked prompt injection
 * attempt, or a PII redaction event on LLM output. Used for:
 *  - Security audit trails
 *  - Identifying attack patterns
 *  - Tuning guardrail rules
 */
@Entity('guardrail_logs')
export class GuardrailLog {
  @PrimaryColumn({ type: 'varchar', length: 26 })
  id!: string;

  /** Which guardrail triggered: "input_sanitizer" or "output_guardrail". */
  @Column({ type: 'varchar', length: 30 })
  layer!: 'input_sanitizer' | 'output_guardrail';

  /** The specific rule that matched (e.g. "prompt_injection_pattern", "pii_phone", "pii_email"). */
  @Column({ type: 'varchar', length: 50 })
  rule!: string;

  /** Severity: "blocked" (request rejected), "redacted" (content scrubbed), "flagged" (logged only). */
  @Column({ type: 'varchar', length: 20 })
  action!: 'blocked' | 'redacted' | 'flagged';

  /** The user who triggered the event (if available). */
  @Column({ type: 'varchar', length: 26, nullable: true })
  @Index()
  userId!: string | null;

  /** Truncated sample of the matched content (max 500 chars for privacy). */
  @Column({ type: 'varchar', length: 500, nullable: true })
  matchedSample!: string | null;

  /** Additional context (e.g. which endpoint or tool was in use). */
  @Column({ type: 'varchar', length: 200, nullable: true })
  context!: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  @Index()
  createdAt!: Date;
}
