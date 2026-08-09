import { Injectable, Inject } from '@nestjs/common';
import type { Tool } from '@earendil-works/pi-ai';

export type Scene =
  | 'JOB_ANALYSIS'
  | 'ONBOARDING'
  | 'GAP_MINING'
  | 'TAILOR_EDIT'
  | 'FOLLOWUP'
  | 'FREE_CHAT'
  | 'OFFER_ACCEPTED'
  | 'ALL';

export interface ToolContext {
  userId: string;
  conversationId: string;
}

export interface ToolExecutor {
  readonly name: string;
  /** Conversation kinds this tool is available in. Use 'ALL' to allow in every kind. */
  readonly scenes: readonly Scene[];
  readonly description: string;
  readonly parameters: unknown;
  execute(
    toolCallId: string,
    params: Record<string, unknown>,
    context: ToolContext,
  ): Promise<{ content: Array<{ type: string; text: string }>; details: Record<string, unknown> }>;
}

export const TOOL_EXECUTORS = Symbol('TOOL_EXECUTORS');

@Injectable()
export class ToolRegistry {
  private readonly toolMap: Map<string, ToolExecutor>;

  constructor(@Inject(TOOL_EXECUTORS) tools: ToolExecutor[]) {
    this.toolMap = new Map();
    for (const tool of tools) {
      this.assertValidTool(tool);
      this.toolMap.set(tool.name, tool);
    }
  }

  get(name: string): ToolExecutor | undefined {
    return this.toolMap.get(name);
  }

  getToolsForScene(conversationKind: string): Tool[] {
    return Array.from(this.toolMap.values())
      .filter((t) => t.scenes.includes('ALL') || t.scenes.includes(conversationKind as Scene))
      .map((t) => ({
        name: t.name,
        description: t.description,
        parameters: t.parameters as Record<string, unknown>,
      }));
  }

  private assertValidTool(t: ToolExecutor): void {
    if (!t.name) {
      throw new Error(`Tool registration error: missing string 'name' field`);
    }
    if (t.scenes.length === 0) {
      throw new Error(`Tool registration error: '${t.name}' missing non-empty 'scenes' array`);
    }
    if (t['parameters'] === undefined || t['parameters'] === null) {
      throw new Error(`Tool registration error: '${t.name}' missing 'parameters' schema`);
    }
  }
}
