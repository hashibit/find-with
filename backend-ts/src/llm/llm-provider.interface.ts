import { stream, type Context } from '@earendil-works/pi-ai';

export const LLM_PROVIDER = Symbol('LLM_PROVIDER');

/**
 * Seam between the rest of the application and the underlying LLM library.
 *
 * All tools, processors, and agent services depend on this interface — not on
 * LlmService directly. This keeps the blast radius of a pi-ai API change to a
 * single adapter (LlmService) rather than every caller.
 *
 * A StubLlmProvider can be injected in tests to eliminate network calls.
 */
export interface LlmProvider {
  /** Streaming turn — used by the agent loop. */
  streamContext(context: Context): ReturnType<typeof stream>;

  /** One-shot completion — used by tools for structured JSON extraction. */
  completeContext(context: Context): Promise<string>;

  /** Text embedding. */
  embed(text: string): Promise<number[]>;

  /** Circuit-breaker: record an LLM error against the primary provider. */
  recordError(): void;

  /** Circuit-breaker: clear error count after a successful response. */
  clearErrors(): void;

  /** Health check: returns ok if the provider is ready. */
  ready(): Promise<void>;
}
