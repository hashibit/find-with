import { Global, Module, type OnModuleInit, Logger, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../../config/configuration.js';

/**
 * Span attributes attached to LLM calls for observability.
 */
export interface LlmSpanAttributes {
  'llm.provider': string;
  'llm.model': string;
  'llm.endpoint': string;
  'llm.input_tokens': number;
  'llm.output_tokens': number;
  'llm.cache_read_tokens': number;
  'llm.cache_write_tokens': number;
  'llm.cost_usd': number;
  'llm.latency_ms': number;
  'llm.provider_tier': 'primary' | 'fallback';
  'llm.error'?: string;
}

/** Subset of LlmSpanAttributes provided by the caller (the rest is filled by startLlmSpan). */
export interface LlmCallMetrics {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  costUsd: number;
  error?: string;
}

/**
 * TraceContext carries the current span/request correlation IDs through
 * the application. Used to propagate tracing from HTTP → AgentService → LLM.
 */
export interface TraceContext {
  traceId: string;
  spanId: string;
}

/**
 * TracingService provides structured LLM call instrumentation.
 *
 * In production, this emits OpenTelemetry spans that flow to
 * Sentry / Grafana Tempo / HyperDX for distributed tracing.
 *
 * In dev, spans are logged to console for debugging.
 *
 * Architecture:
 *   Extension (Chrome)
 *     → HTTP (with traceparent header)
 *       → AgentService.runAgentLoop()
 *         → LlmSpan (instrumented LLM call)
 *         → ToolSpan (instrumented tool execution)
 *
 * Each LLM call span captures: model, tokens, cost, latency, provider tier.
 */
@Injectable()
export class TracingService {
  private readonly logger = new Logger(TracingService.name);
  private readonly enabled: boolean;

  constructor(private readonly configService: ConfigService<AppConfig>) {
    const sentryDsn = this.configService.get('sentry', { infer: true })?.dsn;
    this.enabled = !!sentryDsn;
    if (this.enabled) {
      this.logger.log('Tracing enabled — spans will be emitted to Sentry');
    }
  }

  /**
   * Create a span for an LLM call. Returns a function to end the span with attributes.
   *
   * Usage:
   *   const endSpan = tracing.startLlmSpan('agent', 'gpt-4.1', 'openai');
   *   const response = await llm.complete(...);
   *   endSpan({ inputTokens: 100, outputTokens: 50, ... });
   */
  startLlmSpan(
    endpoint: string,
    model: string,
    provider: string,
    providerTier: 'primary' | 'fallback' = 'primary',
  ): (attrs: LlmCallMetrics) => void {
    const startTime = Date.now();

    return (attrs) => {
      const latencyMs = Date.now() - startTime;
      const span: LlmSpanAttributes = {
        'llm.provider': provider,
        'llm.model': model,
        'llm.endpoint': endpoint,
        'llm.provider_tier': providerTier,
        'llm.input_tokens': attrs.inputTokens,
        'llm.output_tokens': attrs.outputTokens,
        'llm.cache_read_tokens': attrs.cacheReadTokens,
        'llm.cache_write_tokens': attrs.cacheWriteTokens,
        'llm.cost_usd': attrs.costUsd,
        'llm.latency_ms': latencyMs,
      };

      if (attrs.error) {
        span['llm.error'] = attrs.error;
      }

      if (this.enabled) {
        // Emit as structured log — Sentry SDK transforms these into span events.
        // In production with full OTel setup, this would use context.with/startActiveSpan.
        this.logger.log(span, `llm_call:${endpoint}:${model}`);
      }
    };
  }

  /**
   * Extract trace context from incoming HTTP request headers.
   * Follows W3C Trace Context standard (traceparent header).
   */
  extractTraceContext(headers: Record<string, string | string[] | undefined>): TraceContext | null {
    const traceparent = headers['traceparent'] as string | undefined;
    if (!traceparent) return null;

    // Format: 00-{traceId}-{spanId}-{traceFlags}
    const parts = traceparent.split('-');
    if (parts.length < 3) return null;

    return {
      traceId: parts[1] ?? '',
      spanId: parts[2] ?? '',
    };
  }
}

@Global()
@Module({
  providers: [TracingService],
  exports: [TracingService],
})
export class TracingModule implements OnModuleInit {
  private readonly logger = new Logger(TracingModule.name);

  constructor(private readonly tracing: TracingService) {}

  onModuleInit(): void {
    this.logger.log('TracingModule initialized');
  }
}
