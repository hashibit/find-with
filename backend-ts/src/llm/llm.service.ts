import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { AppConfig } from '../config/configuration.js';

export const MODEL_PARSE = 'gpt-4.1-mini';
export const MODEL_WRITE = 'gpt-4.1';

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  toolCallId?: string;
  name?: string;
  toolCalls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }>;
}

export interface ToolDef {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface StreamEvent {
  kind: 'text_delta' | 'tool_call' | 'done' | 'error';
  delta?: string;
  toolName?: string;
  toolArgs?: string;
  toolCallId?: string;
  promptTokens?: number;
  completionTokens?: number;
  finishReason?: string;
  error?: string;
}

interface ProviderError {
  count: number;
  lastAt: number;
}

const FAILOVER_THRESHOLD = 5;
const FAILOVER_WINDOW_MS = 60_000;

@Injectable()
export class LlmService {
  private readonly logger = new Logger(LlmService.name);
  private readonly openai: OpenAI;
  private readonly anthropic: Anthropic;
  private readonly errors: ProviderError = { count: 0, lastAt: 0 };

  constructor(private readonly config: ConfigService<AppConfig>) {
    const llm = this.config.get('llm', { infer: true })!;
    this.openai = new OpenAI({ apiKey: llm.openaiApiKey });
    this.anthropic = new Anthropic({ apiKey: llm.anthropicApiKey });
  }

  async *stream(
    model: string,
    messages: LLMMessage[],
    tools?: ToolDef[],
  ): AsyncGenerator<StreamEvent> {
    const useAnthropic = this.shouldFailover();

    if (useAnthropic) {
      yield* this.streamAnthropic(messages, tools);
    } else {
      try {
        yield* this.streamOpenAI(model, messages, tools);
        this.errors.count = 0;
      } catch (err) {
        this.recordError();
        this.logger.warn(`OpenAI error, falling over to Anthropic: ${String(err)}`);
        yield* this.streamAnthropic(messages, tools);
      }
    }
  }

  async complete(model: string, messages: LLMMessage[]): Promise<string> {
    const resp = await this.openai.chat.completions.create({
      model,
      messages: messages as OpenAI.ChatCompletionMessageParam[],
    });
    return resp.choices[0]?.message?.content ?? '';
  }

  async embed(text: string): Promise<number[]> {
    const resp = await this.openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: text,
    });
    return resp.data[0]!.embedding;
  }

  private async *streamOpenAI(
    model: string,
    messages: LLMMessage[],
    tools?: ToolDef[],
  ): AsyncGenerator<StreamEvent> {
    const params: OpenAI.Chat.ChatCompletionCreateParamsStreaming = {
      model,
      messages: messages as OpenAI.ChatCompletionMessageParam[],
      stream: true,
      ...(tools?.length
        ? {
            tools: tools.map((t) => ({
              type: 'function' as const,
              function: { name: t.name, description: t.description, parameters: t.parameters },
            })),
          }
        : {}),
    };

    const stream = await this.openai.chat.completions.create(params);
    const toolCallAccumulator: Record<string, { name: string; args: string }> = {};

    let promptTokens = 0;
    let completionTokens = 0;
    let finishReason = '';

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta;
      if (!delta) continue;

      if (delta.content) {
        yield { kind: 'text_delta', delta: delta.content };
      }

      if (delta.tool_calls) {
        for (const tc of delta.tool_calls) {
          const idx = String(tc.index);
          if (!toolCallAccumulator[idx]) {
            toolCallAccumulator[idx] = { name: tc.function?.name ?? '', args: '' };
          }
          toolCallAccumulator[idx]!.args += tc.function?.arguments ?? '';
          if (tc.function?.name) toolCallAccumulator[idx]!.name = tc.function.name;
        }
      }

      if (chunk.usage) {
        promptTokens = chunk.usage.prompt_tokens;
        completionTokens = chunk.usage.completion_tokens;
      }

      finishReason = chunk.choices[0]?.finish_reason ?? '';
    }

    for (const [idx, tc] of Object.entries(toolCallAccumulator)) {
      yield { kind: 'tool_call', toolName: tc.name, toolArgs: tc.args, toolCallId: idx };
    }

    yield { kind: 'done', promptTokens, completionTokens, finishReason };
  }

  private async *streamAnthropic(
    messages: LLMMessage[],
    tools?: ToolDef[],
  ): AsyncGenerator<StreamEvent> {
    const systemMsg = messages.find((m) => m.role === 'system');
    const userMsgs = messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

    const stream = await this.anthropic.messages.stream({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      system: systemMsg?.content,
      messages: userMsgs,
      ...(tools?.length
        ? {
            tools: tools.map((t) => ({
              name: t.name,
              description: t.description,
              input_schema: t.parameters as Anthropic.Tool['input_schema'],
            })),
          }
        : {}),
    });

    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        yield { kind: 'text_delta', delta: event.delta.text };
      }
    }

    const final = await stream.finalMessage();
    yield {
      kind: 'done',
      promptTokens: final.usage.input_tokens,
      completionTokens: final.usage.output_tokens,
      finishReason: final.stop_reason ?? '',
    };
  }

  private shouldFailover(): boolean {
    const now = Date.now();
    if (now - this.errors.lastAt > FAILOVER_WINDOW_MS) {
      this.errors.count = 0;
    }
    return this.errors.count >= FAILOVER_THRESHOLD;
  }

  private recordError(): void {
    const now = Date.now();
    if (now - this.errors.lastAt > FAILOVER_WINDOW_MS) {
      this.errors.count = 0;
    }
    this.errors.count++;
    this.errors.lastAt = now;
  }
}
