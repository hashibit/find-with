import {
  Injectable,
  type NestInterceptor,
  type ExecutionContext,
  type CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TokenUsageLog } from '../../database/entities/telemetry/token-usage-log.entity.js';
import { ulid } from 'ulid';

/**
 * TokenCostInterceptor wraps controller handlers that invoke LLM calls.
 *
 * It reads the token usage and cost metadata set on the response by the
 * LLM service and persists a TokenUsageLog record asynchronously.
 *
 * Usage: @UseInterceptors(TokenCostInterceptor) on a controller or route.
 */
@Injectable()
export class TokenCostInterceptor implements NestInterceptor {
  private readonly logger = new Logger(TokenCostInterceptor.name);

  constructor(
    @InjectRepository(TokenUsageLog)
    private readonly logRepo: Repository<TokenUsageLog>,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest();
    const endpoint = request.route?.path ?? 'unknown';
    const userId = (request.user as { userId?: string } | undefined)?.userId ?? null;

    return next.handle().pipe(
      tap((responseBody) => {
        // Extract usage metadata attached by AgentService/LlmService
        const meta = this.extractUsageMeta(responseBody);
        if (!meta) return;

        void this.logRepo.save(
          this.logRepo.create({
            id: ulid(),
            userId,
            endpoint,
            provider: meta.provider,
            model: meta.model,
            inputTokens: meta.inputTokens,
            outputTokens: meta.outputTokens,
            cacheReadTokens: meta.cacheReadTokens ?? 0,
            cacheWriteTokens: meta.cacheWriteTokens ?? 0,
            costUsd: meta.costUsd,
            providerTier: meta.providerTier ?? 'primary',
            latencyMs: meta.latencyMs ?? null,
          }),
        ).catch((err) => {
          this.logger.error({ err, endpoint, userId }, 'Failed to persist token usage log');
        });
      }),
    );
  }

  private extractUsageMeta(body: unknown): {
    provider: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens?: number;
    cacheWriteTokens?: number;
    costUsd: number;
    providerTier?: 'primary' | 'fallback';
    latencyMs?: number;
  } | null {
    if (typeof body !== 'object' || body === null) return null;
    const meta = (body as Record<string, unknown>)['_tokenUsage'] as Record<string, unknown> | undefined;
    if (!meta) return null;
    return meta as ReturnType<typeof this.extractUsageMeta>;
  }
}
