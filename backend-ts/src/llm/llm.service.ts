import { Injectable } from '@nestjs/common';
import { getModel, stream, complete, type Context } from '@earendil-works/pi-ai';
import OpenAI from 'openai';
import { type LlmProvider } from './llm-provider.interface.js';

export const MODEL_PARSE = 'gpt-4.1-mini';
export const MODEL_WRITE = 'gpt-4.1';
export const MODEL_WRITE_FALLBACK = 'claude-sonnet-4-6';

const FAILOVER_THRESHOLD = 5;
const FAILOVER_WINDOW_MS = 60_000;

@Injectable()
export class LlmService implements LlmProvider {
  // openai kept solely for embeddings — pi-ai does not cover the embeddings API
  private readonly openai: OpenAI;
  private errorCount = 0;
  private errorLastAt = 0;

  constructor() {
    // pi-ai reads OPENAI_API_KEY + ANTHROPIC_API_KEY from process.env automatically
    this.openai = new OpenAI();
  }

  /** Returns a pi-ai stream. Caller iterates events and calls .result() for the final message. */
  streamContext(context: Context): ReturnType<typeof stream> {
    const model = this.shouldFailover()
      ? getModel('anthropic', MODEL_WRITE_FALLBACK)
      : getModel('openai', MODEL_WRITE);
    return stream(model, context);
  }

  /** One-shot completion — used by tools for structured JSON extraction. */
  async completeContext(context: Context): Promise<string> {
    const model = getModel('openai', MODEL_PARSE);
    const msg = await complete(model, context);
    const block = msg.content.find((b) => b.type === 'text');
    return block?.type === 'text' ? block.text : '';
  }

  async embed(text: string): Promise<number[]> {
    const resp = await this.openai.embeddings.create({
      model: 'text-embedding-3-small',
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

  private shouldFailover(): boolean {
    const now = Date.now();
    if (now - this.errorLastAt > FAILOVER_WINDOW_MS) this.errorCount = 0;
    return this.errorCount >= FAILOVER_THRESHOLD;
  }
}
