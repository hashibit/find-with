import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { stream, complete, type Context, type Model, type Api } from '@earendil-works/pi-ai/compat';
import OpenAI from 'openai';
import { type LlmProvider } from './llm-provider.interface.js';
import { type AppConfig } from '../config/configuration.js';

const FAILOVER_THRESHOLD = 5;
const FAILOVER_WINDOW_MS = 60_000;

@Injectable()
export class LlmService implements LlmProvider {
  private readonly logger = new Logger(LlmService.name);
  // OpenAI client for embeddings — pi-ai does not cover the embeddings API
  private readonly openai: OpenAI;
  private errorCount = 0;
  private errorLastAt = 0;

  // API keys for each provider
  private readonly openaiApiKey?: string;
  private readonly anthropicApiKey?: string;
  private readonly openrouterApiKey?: string;

  constructor(private readonly configService: ConfigService<AppConfig>) {
    const llmConfig = this.configService.get('llm', { infer: true });

    this.openaiApiKey = llmConfig.openai.apiKey;
    this.anthropicApiKey = llmConfig.anthropic.apiKey;
    this.openrouterApiKey = llmConfig.openrouter.apiKey;

    // Set environment variables for pi-ai (it reads from process.env)
    if (this.openaiApiKey) process.env.OPENAI_API_KEY = this.openaiApiKey;
    if (this.anthropicApiKey) process.env.ANTHROPIC_API_KEY = this.anthropicApiKey;
    if (this.openrouterApiKey) process.env.OPENROUTER_API_KEY = this.openrouterApiKey;

    // OpenAI client for embeddings
    this.openai = new OpenAI({
      apiKey: this.openaiApiKey,
      baseURL: llmConfig.openai.baseUrl,
    });

    this.logger.log(`LlmService initialized: provider=${llmConfig.provider}`);
  }

  /** Stream with a specific model. Used by AgentService. */
  streamContextWithModel(model: Model<Api>, context: Context): ReturnType<typeof stream> {
    // Build options with apiKey based on provider
    const options: Record<string, unknown> = {};

    if (model.provider === 'openai' && this.openaiApiKey) {
      options.apiKey = this.openaiApiKey;
    } else if (model.provider === 'anthropic' && this.anthropicApiKey) {
      options.apiKey = this.anthropicApiKey;
    } else if (model.provider === 'openrouter' && this.openrouterApiKey) {
      options.apiKey = this.openrouterApiKey;
    }

    return stream(model, context, options);
  }

  /** Legacy method - kept for compatibility. Returns a pi-ai stream. */
  streamContext(context: Context): ReturnType<typeof stream> {
    // This method is no longer used by AgentService, but kept for backward compatibility
    const llmConfig = this.configService.get('llm', { infer: true });
    const provider = llmConfig.provider;
    const providerConfig = llmConfig[provider];

    const api: Api = provider === 'anthropic' ? 'anthropic-messages' : 'openai-completions';
    const modelId = providerConfig.model || 'gpt-4.1';
    const baseUrl = providerConfig.baseUrl || 'https://api.openai.com/v1';

    const model: Model<Api> = {
      id: modelId,
      name: modelId,
      api,
      provider,
      baseUrl,
      reasoning: provider === 'anthropic',
      input: ['text', 'image'],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 128000,
      maxTokens: 16384,
    };

    return this.streamContextWithModel(model, context);
  }

  /** One-shot completion — used by tools for structured JSON extraction. */
  async completeContext(context: Context): Promise<string> {
    const llmConfig = this.configService.get('llm', { infer: true });
    const provider = llmConfig.provider;
    const providerConfig = llmConfig[provider];

    const api: Api = provider === 'anthropic' ? 'anthropic-messages' : 'openai-completions';
    const modelId = providerConfig.model || 'gpt-4.1-mini';
    const baseUrl = providerConfig.baseUrl || 'https://api.openai.com/v1';

    const model: Model<Api> = {
      id: modelId,
      name: modelId,
      api,
      provider,
      baseUrl,
      reasoning: false,
      input: ['text'],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 128000,
      maxTokens: 4096,
    };

    const options: Record<string, unknown> = {};
    if (provider === 'openai' && this.openaiApiKey) options.apiKey = this.openaiApiKey;
    else if (provider === 'anthropic' && this.anthropicApiKey) options.apiKey = this.anthropicApiKey;
    else if (provider === 'openrouter' && this.openrouterApiKey) options.apiKey = this.openrouterApiKey;

    const msg = await complete(model, context, options);
    const block = msg.content.find((b) => b.type === 'text');
    return block?.type === 'text' ? block.text : '';
  }

  async embed(text: string): Promise<number[]> {
    const llmConfig = this.configService.get('llm', { infer: true });
    const embeddingModel = llmConfig.embeddingModel;

    const resp = await this.openai.embeddings.create({
      model: embeddingModel,
      input: text,
    });
    return resp.data[0]!.embedding;
  }

  recordError(): void {
    const now = Date.now();
    if (now - this.errorLastAt > FAILOVER_WINDOW_MS) this.errorCount = 0;
    this.errorCount++;
    this.errorLastAt = now;
  }

  clearErrors(): void {
    this.errorCount = 0;
  }

  async ready(): Promise<void> {
    // Lightweight check: verify at least one API key is configured
    const llmConfig = this.configService.get('llm', { infer: true });
    const provider = llmConfig.provider;
    const apiKey = llmConfig[provider].apiKey;

    if (!apiKey) {
      throw new Error(`${provider.toUpperCase()}_API_KEY is not configured`);
    }
  }
}