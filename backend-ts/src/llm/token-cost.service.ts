import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { encoding_for_model, type TiktokenModel } from 'tiktoken';
import type { AppConfig } from '../config/configuration.js';

/**
 * Per-model pricing (USD per 1K tokens). Updated Q2 2026.
 * These are the default prices; provider-level overrides in configuration take precedence.
 */
const MODEL_PRICING: Record<string, { input: number; output: number; cacheRead: number; cacheWrite: number }> = {
  // OpenAI
  'gpt-4.1': { input: 0.002, output: 0.008, cacheRead: 0.0005, cacheWrite: 0.001 },
  'gpt-4.1-mini': { input: 0.0004, output: 0.0016, cacheRead: 0.0001, cacheWrite: 0.0002 },
  'gpt-4o': { input: 0.0025, output: 0.01, cacheRead: 0.00125, cacheWrite: 0.0025 },
  'gpt-4o-mini': { input: 0.00015, output: 0.0006, cacheRead: 0.000075, cacheWrite: 0.00015 },
  'gpt-4.1-nano': { input: 0.0001, output: 0.0004, cacheRead: 0.000025, cacheWrite: 0.00005 },
  // Anthropic
  'claude-sonnet-4-6': { input: 0.003, output: 0.015, cacheRead: 0.0003, cacheWrite: 0.00375 },
  'claude-3-5-haiku-latest': { input: 0.0008, output: 0.004, cacheRead: 0.00008, cacheWrite: 0.001 },
  'claude-opus-4-8': { input: 0.015, output: 0.075, cacheRead: 0.0015, cacheWrite: 0.01875 },
  // OpenRouter fallbacks
  'anthropic/claude-sonnet-4': { input: 0.003, output: 0.015, cacheRead: 0.0003, cacheWrite: 0.00375 },
  'openai/gpt-4.1-mini': { input: 0.0004, output: 0.0016, cacheRead: 0.0001, cacheWrite: 0.0002 },
};

/** Tokenizer model mapping — tiktoken encoding name for each provider's primary model. */
const TOKENIZER_MAP: Record<string, TiktokenModel> = {
  openai: 'gpt-4o',
  anthropic: 'gpt-4o', // Anthropic uses a different tokenizer, but tiktoken is close enough for estimation
  openrouter: 'gpt-4o',
};

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export interface CostBreakdown {
  inputCost: number;
  outputCost: number;
  cacheReadCost: number;
  cacheWriteCost: number;
  totalCost: number;
}

/**
 * TokenCostService estimates token counts and calculates costs BEFORE generation,
 * and tracks actual usage AFTER generation.
 *
 * Pre-generation: uses tiktoken to count input tokens and estimates output.
 * Post-generation: uses actual usage from the API response.
 *
 * This is the single source of truth for LLM economics in FindWith.
 */
@Injectable()
export class TokenCostService {
  private readonly logger = new Logger(TokenCostService.name);
  private readonly encoders = new Map<string, ReturnType<typeof encoding_for_model>>();

  constructor(private readonly configService: ConfigService<AppConfig>) {}

  /** Estimate input token count for a string using the appropriate tokenizer. */
  estimateTokens(text: string, provider?: string): number {
    const encoder = this.getEncoder(provider);
    return encoder.encode(text).length;
  }

  /** Estimate tokens for a conversation context (system + messages). */
  estimateContextTokens(
    systemPrompt: string,
    messages: Array<{ content: string }>,
    provider?: string,
  ): number {
    let total = this.estimateTokens(systemPrompt, provider);
    for (const msg of messages) {
      total += this.estimateTokens(msg.content, provider);
    }
    // Add ~5% overhead for message formatting tokens
    return Math.ceil(total * 1.05);
  }

  /** Estimate the cost of a request BEFORE generation. */
  estimateCost(
    modelId: string,
    estimatedInputTokens: number,
    estimatedOutputTokens: number,
  ): CostBreakdown {
    const pricing = this.getPricing(modelId);

    const inputCost = (estimatedInputTokens / 1000) * pricing.input;
    const outputCost = (estimatedOutputTokens / 1000) * pricing.output;

    return {
      inputCost: roundUSD(inputCost),
      outputCost: roundUSD(outputCost),
      cacheReadCost: 0,
      cacheWriteCost: 0,
      totalCost: roundUSD(inputCost + outputCost),
    };
  }

  /** Calculate actual cost from API response usage. */
  calculateActualCost(modelId: string, usage: TokenUsage): CostBreakdown {
    const pricing = this.getPricing(modelId);

    const inputCost = (usage.inputTokens / 1000) * pricing.input;
    const outputCost = (usage.outputTokens / 1000) * pricing.output;
    const cacheReadCost = (usage.cacheReadTokens / 1000) * pricing.cacheRead;
    const cacheWriteCost = (usage.cacheWriteTokens / 1000) * pricing.cacheWrite;

    return {
      inputCost: roundUSD(inputCost),
      outputCost: roundUSD(outputCost),
      cacheReadCost: roundUSD(cacheReadCost),
      cacheWriteCost: roundUSD(cacheWriteCost),
      totalCost: roundUSD(inputCost + outputCost + cacheReadCost + cacheWriteCost),
    };
  }

  /** Get pricing for a specific model, with fallback to a reasonable default. */
  getPricing(modelId: string): typeof MODEL_PRICING[string] {
    // Direct match
    if (MODEL_PRICING[modelId]) return MODEL_PRICING[modelId]!;

    // Partial match: check if modelId starts with any known prefix
    for (const [key, pricing] of Object.entries(MODEL_PRICING)) {
      if (modelId.startsWith(key)) return pricing;
    }

    // Default: conservative estimate (GPT-4.1 pricing)
    this.logger.warn(`Unknown model "${modelId}", using default pricing`);
    return MODEL_PRICING['gpt-4.1']!;
  }

  /** Get or create a tiktoken encoder for a provider. */
  private getEncoder(provider?: string): ReturnType<typeof encoding_for_model> {
    const key = provider ?? 'openai';
    if (!this.encoders.has(key)) {
      const modelName = TOKENIZER_MAP[key] ?? 'gpt-4o';
      this.encoders.set(key, encoding_for_model(modelName));
    }
    return this.encoders.get(key)!;
  }
}

function roundUSD(n: number): number {
  return Math.round(n * 1_000_000) / 1_000_000;
}
