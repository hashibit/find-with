import { Injectable, Logger } from '@nestjs/common';
import { z, type ZodType, type ZodError } from 'zod';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ParseFailureLog } from '../database/entities/agent/parse-failure-log.entity.js';
import { ulid } from 'ulid';

/**
 * Structured result of a validated LLM JSON extraction.
 */
export interface ValidatedResult<T> {
  ok: boolean;
  data: T | null;
  /** Human-readable error summary to feed back to the LLM for self-correction. */
  errorFeedback?: string;
  /** Number of retry attempts consumed. */
  retries: number;
}

/**
 * ValidatedJsonAgent enforces Zod schemas on LLM JSON outputs with auto-retry.
 *
 * When a parse/validation failure occurs, it produces structured error feedback
 * that can be injected back into the prompt so the LLM can self-correct.
 *
 * Every failure is logged to ParseFailureLog for observability and debugging.
 */
@Injectable()
export class ValidatedJsonAgent {
  private readonly logger = new Logger(ValidatedJsonAgent.name);

  /** Maximum retry attempts per extraction. */
  static readonly MAX_RETRIES = 3;

  constructor(
    @InjectRepository(ParseFailureLog)
    private readonly failureLogRepo: Repository<ParseFailureLog>,
  ) {}

  /**
   * Parse and validate raw LLM text against a Zod schema.
   *
   * On failure, returns structured feedback suitable for injecting back
   * into the LLM prompt so it can self-correct on the next attempt.
   *
   * @param schema  The Zod schema to validate against.
   * @param raw     Raw LLM output text.
   * @param context Human-readable label for logging (e.g. "tool:recompute_match").
   * @param attempt Current retry attempt number (0-indexed).
   */
  extract<T>(
    schema: ZodType<T>,
    raw: string,
    context: string,
    attempt = 0,
  ): ValidatedResult<T> {
    // Step 1: Try direct JSON parse
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw.trim());
    } catch {
      // Step 2: Try extracting balanced braces/brackets
      const extracted = this.extractBalanced(raw);
      if (extracted) {
        try {
          parsed = JSON.parse(extracted);
        } catch {
          return this.logAndReturnFailure<T>(raw, context, attempt, 'JSON parse failed after balanced extraction');
        }
      } else {
        return this.logAndReturnFailure<T>(raw, context, attempt, 'No valid JSON structure found in LLM output');
      }
    }

    // Step 3: Validate against Zod schema
    const result = schema.safeParse(parsed);
    if (!result.success) {
      const feedback = this.formatZodErrors(result.error, schema);
      return this.logAndReturnFailure<T>(raw, context, attempt, feedback);
    }

    return { ok: true, data: result.data, retries: attempt };
  }

  /**
   * Format Zod validation errors into LLM-friendly feedback.
   * The output is designed to be pasted into a retry prompt so the LLM
   * can understand exactly which fields are wrong and why.
   */
  formatZodErrors(error: ZodError, _schema: ZodType<unknown>): string {
    const issues = error.issues.map((issue, i) => {
      const path = issue.path.length > 0 ? issue.path.join('.') : '(root)';
      const received = JSON.stringify(
        'received' in issue ? issue.received : '<unknown>',
      );
      return `  ${i + 1}. Field "${path}": ${issue.message} (received: ${received})`;
    });
    return `Schema validation failed with ${error.issues.length} issue(s):\n${issues.join('\n')}`;
  }

  /**
   * Generate a self-correction prompt to feed back to the LLM.
   * Include this in the next system/user message so the model can fix its output.
   */
  buildRetryFeedback<T>(prevResult: ValidatedResult<T>): string {
    return [
      'Your previous JSON output was invalid. Please fix the following issues and try again:',
      '',
      prevResult.errorFeedback ?? 'Unknown validation error',
      '',
      'Respond with ONLY the corrected JSON, no additional text.',
    ].join('\n');
  }

  /**
   * Test whether a result needs retry and we haven't exceeded max attempts.
   */
  shouldRetry<T>(result: ValidatedResult<T>, maxRetries = ValidatedJsonAgent.MAX_RETRIES): boolean {
    return !result.ok && result.retries < maxRetries;
  }

  // ── Private helpers ──────────────────────────────────────────

  private logAndReturnFailure<T>(
    raw: string,
    context: string,
    attempt: number,
    message: string,
  ): ValidatedResult<T> {
    this.logger.warn(
      `[json-validator] ${context} attempt ${attempt + 1}/${ValidatedJsonAgent.MAX_RETRIES + 1}: ${message.slice(0, 200)}`,
    );

    // Persist asynchronously — off the hot path
    void this.failureLogRepo.save(
      this.failureLogRepo.create({
        id: ulid(),
        context,
        rawOutput: raw.slice(0, 8000),
        errorMessage: message.slice(0, 2000),
        attempt,
        timestamp: new Date(),
      }),
    );

    return {
      ok: false,
      data: null,
      errorFeedback: message,
      retries: attempt,
    };
  }

  /**
   * Extract balanced JSON from text that may have leading/trailing non-JSON content.
   * Handles nested braces and brackets with string-awareness.
   */
  private extractBalanced(raw: string): string | null {
    // Try braces first
    const obj = this.extractBalancedDelim(raw, '{', '}');
    if (obj) return obj;
    // Then brackets
    return this.extractBalancedDelim(raw, '[', ']');
  }

  private extractBalancedDelim(
    raw: string,
    open: string,
    close: string,
  ): string | null {
    const start = raw.indexOf(open);
    if (start < 0) return null;
    let depth = 0;
    let inString = false;
    let escape = false;
    for (let i = start; i < raw.length; i++) {
      const ch = raw[i]!;
      if (escape) {
        escape = false;
        continue;
      }
      if (ch === '\\') {
        escape = true;
        continue;
      }
      if (ch === '"') {
        inString = !inString;
        continue;
      }
      if (inString) continue;
      if (ch === open) depth++;
      else if (ch === close && --depth === 0) return raw.slice(start, i + 1);
    }
    return null;
  }
}
