import {
  Entity,
  Column,
  PrimaryColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';

/**
 * TokenUsageLog records every LLM API call with its token consumption and cost.
 *
 * This is the financial observability layer for LLM usage. Each row captures:
 * - Which endpoint/feature triggered the call
 * - Which model was used
 * - Token counts (input, output, cache reads/writes)
 * - Actual cost in USD
 *
 * Aggregated across time, this enables:
 *  - Per-user cost tracking
 *  - Per-feature cost attribution
 *  - Provider comparison (cost per 1K tokens by model)
 *  - Budget alerting
 */
@Entity('token_usage_logs')
export class TokenUsageLog {
  @PrimaryColumn({ type: 'varchar', length: 26 })
  id!: string;

  /** The user who triggered the LLM call (null for system-initiated calls). */
  @Column({ type: 'varchar', length: 26, nullable: true })
  @Index()
  userId!: string | null;

  /** Which feature/endpoint initiated this call (e.g. "agent", "tailoring", "jd_parse"). */
  @Column({ type: 'varchar', length: 50 })
  @Index()
  endpoint!: string;

  /** Provider name (openai, anthropic, openrouter). */
  @Column({ type: 'varchar', length: 20 })
  @Index()
  provider!: string;

  /** Model ID (e.g. "gpt-4.1", "claude-sonnet-4-6"). */
  @Column({ type: 'varchar', length: 50 })
  model!: string;

  /** Input/prompt tokens consumed. */
  @Column({ type: 'int' })
  inputTokens!: number;

  /** Output/completion tokens generated. */
  @Column({ type: 'int' })
  outputTokens!: number;

  /** Cache read tokens (Anthropic prompt caching). */
  @Column({ type: 'int', default: 0 })
  cacheReadTokens!: number;

  /** Cache write tokens (Anthropic prompt caching). */
  @Column({ type: 'int', default: 0 })
  cacheWriteTokens!: number;

  /** Total cost in USD (stored as decimal with micro-dollar precision). */
  @Column({ type: 'decimal', precision: 12, scale: 6 })
  costUsd!: number;

  /** Whether this was served by the primary or fallback provider. */
  @Column({ type: 'varchar', length: 10, default: 'primary' })
  providerTier!: 'primary' | 'fallback';

  /** Duration of the LLM call in milliseconds. */
  @Column({ type: 'int', nullable: true })
  latencyMs!: number | null;

  @CreateDateColumn({ type: 'timestamptz' })
  @Index()
  createdAt!: Date;
}
