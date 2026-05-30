export const MEMORY_QUEUE = 'memory';

export type MemoryJobData =
  | { type: 'COMPRESS_CONVERSATION'; conversationId: string }
  | { type: 'EXTRACT_PREFERENCES'; conversationId: string; userId: string }
  | { type: 'EMBED_MATERIAL'; materialId: string }
  | { type: 'BACKFILL_EMBEDDINGS'; userId: string };
