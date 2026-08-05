import { Logger } from '@nestjs/common';

/**
 * Circuit breaker states:
 * - CLOSED:   Normal operation, requests pass through.
 * - OPEN:     Failures exceeded threshold, requests are intercepted.
 * - HALF_OPEN: Probing state — allow one test request to check if provider recovered.
 */
export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

/**
 * CircuitBreaker implements the three-state circuit breaker pattern for LLM providers.
 *
 * When the primary provider experiences consecutive failures, the circuit opens
 * and requests are routed to the fallback. After a cooldown, the circuit enters
 * HALF_OPEN — a single probe request is allowed through. If it succeeds, the
 * circuit closes (normal operation resumes). If it fails, the circuit re-opens.
 *
 * This replaces the naive error-count-based failover in AgentService.shouldFailover().
 */
export class CircuitBreaker {
  private readonly logger: Logger;

  private state: CircuitState = 'CLOSED';
  private failureCount = 0;
  private lastFailureTime = 0;
  private lastSuccessTime = 0;
  private openTime = 0;

  /** Consecutive failures before opening the circuit. */
  readonly failureThreshold: number;

  /** Cooldown in ms before transitioning from OPEN to HALF_OPEN. */
  readonly cooldownMs: number;

  /** Window in ms for resetting failure count (sliding window). */
  readonly windowMs: number;

  /** Provider name for logging. */
  readonly providerName: string;

  constructor(
    logger: Logger,
    providerName: string,
    options: {
      failureThreshold?: number;
      cooldownMs?: number;
      windowMs?: number;
    } = {},
  ) {
    this.logger = logger;
    this.providerName = providerName;
    this.failureThreshold = options.failureThreshold ?? 5;
    this.cooldownMs = options.cooldownMs ?? 30_000; // 30s
    this.windowMs = options.windowMs ?? 60_000; // 1 min
  }

  /** Whether this circuit allows requests through. */
  get isOpen(): boolean {
    return this.state === 'OPEN';
  }

  /** Whether this circuit is probing recovery. */
  get isHalfOpen(): boolean {
    return this.state === 'HALF_OPEN';
  }

  /** Whether this circuit is operating normally. */
  get isClosed(): boolean {
    return this.state === 'CLOSED';
  }

  /** Current state for observability. */
  getStatus(): { state: CircuitState; failureCount: number; provider: string } {
    return {
      state: this.state,
      failureCount: this.failureCount,
      provider: this.providerName,
    };
  }

  /**
   * Called BEFORE making a request. If the circuit is OPEN, returns false
   * and the caller should use the fallback provider.
   *
   * If HALF_OPEN, allows exactly ONE probe request through.
   */
  allowRequest(): boolean {
    const now = Date.now();

    // Reset failure count if window has elapsed
    if (now - this.lastFailureTime > this.windowMs) {
      this.failureCount = 0;
    }

    switch (this.state) {
      case 'CLOSED':
        return true;

      case 'OPEN': {
        // Check if cooldown has elapsed
        const elapsed = now - this.openTime;
        if (elapsed >= this.cooldownMs) {
          this.state = 'HALF_OPEN';
          this.logger.log(
            `Circuit HALF_OPEN for ${this.providerName} after ${elapsed}ms cooldown — probing`,
          );
          return true; // Allow probe request
        }
        this.logger.warn(
          `Circuit OPEN for ${this.providerName} — ${elapsed}ms elapsed, need ${this.cooldownMs}ms`,
        );
        return false;
      }

      case 'HALF_OPEN':
        // Only allow one probe — if we're already probing, reject
        return true;

      default:
        return true;
    }
  }

  /**
   * Called when a request SUCCEEDS.
   */
  recordSuccess(): void {
    const now = Date.now();
    this.lastSuccessTime = now;

    switch (this.state) {
      case 'HALF_OPEN':
        this.state = 'CLOSED';
        this.failureCount = 0;
        this.logger.log(`Circuit CLOSED for ${this.providerName} — probe succeeded, normal operation resumed`);
        break;
      case 'CLOSED':
        this.failureCount = 0;
        break;
      default:
        break;
    }
  }

  /**
   * Called when a request FAILS.
   */
  recordFailure(): void {
    const now = Date.now();
    this.lastFailureTime = now;

    // Reset count if outside window
    if (now - this.lastFailureTime > this.windowMs) {
      this.failureCount = 0;
    }

    this.failureCount++;

    switch (this.state) {
      case 'HALF_OPEN':
        // Probe failed — re-open
        this.state = 'OPEN';
        this.openTime = now;
        this.logger.error(
          `Circuit RE-OPENED for ${this.providerName} — probe failed, ${this.failureCount} failures`,
        );
        break;
      case 'CLOSED':
        if (this.failureCount >= this.failureThreshold) {
          this.state = 'OPEN';
          this.openTime = now;
          this.logger.error(
            `Circuit OPENED for ${this.providerName} — ${this.failureCount} consecutive failures, threshold=${this.failureThreshold}`,
          );
        }
        break;
      default:
        break;
    }
  }

  /**
   * Force reset to CLOSED (admin action).
   */
  forceReset(): void {
    this.state = 'CLOSED';
    this.failureCount = 0;
    this.lastFailureTime = 0;
    this.openTime = 0;
    this.logger.log(`Circuit force-reset for ${this.providerName}`);
  }
}
