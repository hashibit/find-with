// FILE: test/unit/agent/tool-registry.spec.ts
import { describe, it, expect } from 'vitest';
import { ToolRegistry, resolveScene, type ToolExecutor, type Scene } from '../../../src/agent/tool-registry.js';

function makeTool(name: string, scenes: readonly Scene[]): ToolExecutor {
  return {
    name,
    scenes,
    description: `${name} description`,
    parameters: { type: 'object' },
    execute: async () => ({ content: [{ type: 'text', text: '' }], details: {} }),
  };
}

function buildRegistry() {
  const tools = [
    makeTool('mine_shining_point', ['ONBOARDING', 'GAP_MINING']),
    makeTool('classify_email', ['FOLLOWUP']),
    makeTool('draft_reply', ['FOLLOWUP']),
    makeTool('density', ['ALL']),
    makeTool('get_profile', ['ALL']),
  ];
  return { registry: new ToolRegistry(tools), tools };
}

describe('resolveScene', () => {
  it('maps every known kind to itself', () => {
    for (const kind of ['FREE_CHAT', 'ONBOARDING', 'JOB_ANALYSIS', 'GAP_MINING', 'TAILOR_EDIT', 'FOLLOWUP']) {
      expect(resolveScene(kind)).toBe(kind);
    }
  });

  it('normalizes null, undefined, and unknown values to FREE_CHAT', () => {
    expect(resolveScene(null)).toBe('FREE_CHAT');
    expect(resolveScene(undefined)).toBe('FREE_CHAT');
    expect(resolveScene('MATERIAL_RECALL')).toBe('FREE_CHAT'); // extension bug that 400s at creation
    expect(resolveScene('')).toBe('FREE_CHAT');
  });

  it('does NOT treat non-kind scene values as valid inputs', () => {
    // 'OFFER_ACCEPTED' is a Scene (moment-scene, farewell) but not a conversation kind
    expect(resolveScene('OFFER_ACCEPTED')).toBe('FREE_CHAT');
  });
});

describe('ToolRegistry.getToolsForScene', () => {
  it('exposes kind-scoped tools only in their own scenes', () => {
    const { registry } = buildRegistry();

    const onboarding = registry.getToolsForScene('ONBOARDING').map((t) => t.name);
    expect(onboarding).toContain('mine_shining_point');
    expect(onboarding).not.toContain('classify_email');

    const followup = registry.getToolsForScene('FOLLOWUP').map((t) => t.name);
    expect(followup).toContain('classify_email');
    expect(followup).toContain('draft_reply');
    expect(followup).not.toContain('mine_shining_point');
  });

  it("exposes 'ALL' tools in every scene", () => {
    const { registry } = buildRegistry();
    for (const scene of ['FREE_CHAT', 'ONBOARDING', 'GAP_MINING', 'TAILOR_EDIT', 'FOLLOWUP', 'JOB_ANALYSIS'] as const) {
      const names = registry.getToolsForScene(scene).map((t) => t.name);
      expect(names).toContain('density');
      expect(names).toContain('get_profile');
    }
  });

  it('returns only ALL-scoped tools for a scene nothing declares', () => {
    const { registry } = buildRegistry();
    const names = registry.getToolsForScene('OFFER_ACCEPTED').map((t) => t.name);
    expect(names).toEqual(['density', 'get_profile']);
  });

  it('passes tool name/description/parameters through to the LLM-facing shape', () => {
    const { registry } = buildRegistry();
    const tool = registry.getToolsForScene('FOLLOWUP').find((t) => t.name === 'draft_reply');
    expect(tool).toMatchObject({
      name: 'draft_reply',
      description: 'draft_reply description',
      parameters: { type: 'object' },
    });
  });
});
