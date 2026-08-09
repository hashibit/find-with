import { Logger } from '@nestjs/common';

const logger = new Logger('llm-json');

function extractBalanced(raw: string, open: string, close: string): string | null {
  const start = raw.indexOf(open);
  if (start < 0) return null;
  let depth = 0, inString = false, escape = false;
  for (let i = start; i < raw.length; i++) {
    const ch = raw[i]!;
    if (escape) { escape = false; continue; }
    if (ch === '\\') { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === open) depth++;
    if (ch === close) depth--;
    if (depth === 0) return raw.slice(start, i + 1);
  }
  return null;
}

export function parseLlmJson<T = Record<string, unknown>>(raw: string): T {
  try { return JSON.parse(raw.trim()) as T; } catch { /* fallback */ }
  const extracted = extractBalanced(raw, '{', '}');
  if (extracted) {
    try { return JSON.parse(extracted) as T; } catch { /* still failed */ }
  }
  logger.warn(`[llm-json] could not parse object: ${raw.slice(0, 200)}`);
  return {} as T;
}

export function parseLlmJsonArray<T = unknown>(raw: string): T[] {
  try { return JSON.parse(raw.trim()) as T[]; } catch { /* fallback */ }
  const extracted = extractBalanced(raw, '[', ']');
  if (extracted) {
    try { return JSON.parse(extracted) as T[]; } catch { /* still failed */ }
  }
  logger.warn(`[llm-json] could not parse array: ${raw.slice(0, 200)}`);
  return [];
}
