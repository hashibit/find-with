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

/** Scene values that correspond 1:1 to a stored conversation kind. */
const KIND_SCENES: ReadonlySet<string> = new Set([
  'JOB_ANALYSIS',
  'ONBOARDING',
  'GAP_MINING',
  'TAILOR_EDIT',
  'FOLLOWUP',
  'FREE_CHAT',
]);

/**
 * Resolve a stored conversation kind into a tool-gating scene.
 *
 * Today this is the identity map over the known kinds, with unknown/null/legacy
 * values normalized to FREE_CHAT (the kind column is varchar and only the create
 * endpoint is enum-guarded, so arbitrary strings can exist in the DB — a bare
 * cast would silently yield a toolset containing only 'ALL' tools).
 *
 * This is the seam where future non-identity scene derivation lands (e.g. a
 * moment-scene derived from radar status transitions, or entitlement-based
 * gating) — those need a signal source, not a bigger switch here.
 */
export function resolveScene(kind: string | null | undefined): Scene {
  return kind !== null && kind !== undefined && KIND_SCENES.has(kind) ? (kind as Scene) : 'FREE_CHAT';
}

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

  getToolsForScene(scene: Scene): Tool[] {
    return Array.from(this.toolMap.values())
      .filter((t) => t.scenes.includes('ALL') || t.scenes.includes(scene))
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
