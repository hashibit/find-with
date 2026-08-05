import {
  Entity,
  Column,
  PrimaryColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';

/**
 * ParseFailureLog records every LLM JSON parse/validation failure.
 *
 * This is the structured observability layer for the ValidatedJsonAgent.
 * Each row captures one failed extraction attempt — the raw LLM output,
 * the validation error, and which tool/context triggered it.
 *
 * Use this data to:
 *  - Identify which tools have the highest parse failure rates
 *  - Debug prompt improvements for specific contexts
 *  - Track per-model reliability over time
 */
@Entity('parse_failure_logs')
export class ParseFailureLog {
  @PrimaryColumn({ type: 'varchar', length: 26 })
  id!: string;

  /** Which tool or context triggered the extraction (e.g. "tool:recompute_match"). */
  @Column({ type: 'varchar', length: 100 })
  @Index()
  context!: string;

  /** The raw LLM output that failed to parse/validate (truncated at 8000 chars). */
  @Column({ type: 'varchar', length: 8000, nullable: true })
  rawOutput!: string | null;

  /** The validation error message (truncated at 2000 chars). */
  @Column({ type: 'varchar', length: 2000 })
  errorMessage!: string;

  /** Zero-indexed retry attempt number. */
  @Column({ type: 'int', default: 0 })
  attempt!: number;

  @CreateDateColumn({ type: 'timestamptz' })
  @Index()
  timestamp!: Date;
}
