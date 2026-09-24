import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, Inject } from '@nestjs/common';
import { Job } from 'bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, IsNull, MoreThan, Repository } from 'typeorm';
import { ulid } from 'ulid';
import { Type } from '@sinclair/typebox';

import { ConvMessage } from '../../database/entities/conversation/message.entity.js';
import { ConvRollingSummary } from '../../database/entities/conversation/rolling-summary.entity.js';
import { ProfileMaterial } from '../../database/entities/profile/material.entity.js';
import { UserGoalMemory } from '../../database/entities/memory/user-goal-memory.entity.js';
import { FIELD_CRYPTO, type FieldCrypto } from '../../common/crypto/crypto.interface.js';
import { LLM_PROVIDER, type LlmProvider } from '../../llm/llm-provider.interface.js';
import { ContextBuilderService } from '../../agent/context-builder.service.js';
import { MEMORY_QUEUE, type MemoryJobData } from './memory.constants.js';

const GoalExtractionSchema = Type.Object({
  targetRoles: Type.Array(Type.String()),
  targetIndustries: Type.Array(Type.String()),
  locationPrefs: Type.Array(Type.String()),
  dealBreakers: Type.Array(Type.String()),
  preferredStages: Type.Array(Type.String()),
  salaryFloorUsd: Type.Union([Type.Number(), Type.Null()]),
  shortTermGoal: Type.String(),
  rawStatements: Type.Array(Type.String()),
});

const GOAL_EXTRACTION_SYSTEM_PROMPT = `Given the conversation transcript and the user's existing preferences, extract or update job search preferences.

The transcript covers only messages since the last extraction — treat it as the new evidence, not the full history.

Rules:
- Only extract preferences with clear evidence in this transcript
- Do NOT infer or hallucinate preferences not explicitly stated
- dealBreakers: things user said they explicitly do not want
- rawStatements: copy exact user phrases that reveal preferences
- For structured fields return the full updated value based on this transcript — an empty array or null means "no new evidence" and existing values are kept, not erased
- Lines prefixed "Quinn:" are the assistant's suggestions; count a preference as the user's only when the user states it themselves or clearly confirms it`;

@Processor(MEMORY_QUEUE)
export class MemoryProcessor extends WorkerHost {
  private readonly logger = new Logger(MemoryProcessor.name);

  constructor(
    @InjectRepository(ConvMessage)
    private readonly messageRepo: Repository<ConvMessage>,
    @InjectRepository(ConvRollingSummary)
    private readonly rollingSummaryRepo: Repository<ConvRollingSummary>,
    @InjectRepository(ProfileMaterial)
    private readonly materialRepo: Repository<ProfileMaterial>,
    @InjectRepository(UserGoalMemory)
    private readonly goalMemoryRepo: Repository<UserGoalMemory>,
    @Inject(FIELD_CRYPTO) private readonly crypto: FieldCrypto,
    @Inject(LLM_PROVIDER) private readonly llm: LlmProvider,
    private readonly contextBuilder: ContextBuilderService,
  ) {
    super();
  }

  async process(job: Job<MemoryJobData>): Promise<void> {
    const { type } = job.data;
    switch (type) {
      case 'COMPRESS_CONVERSATION':
        await this.compressConversation(job.data.conversationId);
        break;
      case 'EXTRACT_PREFERENCES':
        await this.extractPreferences(job.data.conversationId, job.data.userId);
        break;
      case 'EMBED_MATERIAL':
        await this.embedMaterial(job.data.materialId);
        break;
      case 'BACKFILL_EMBEDDINGS':
        await this.backfillEmbeddings(job.data.userId);
        break;
      default:
        this.logger.warn(`Unknown memory job type: ${(job.data as MemoryJobData).type}`);
    }
  }

  private async compressConversation(conversationId: string): Promise<void> {
    const toCompress = await this.contextBuilder.findMessagesToCompress(conversationId);
    if (!toCompress.messages.length) return;

    const ctx = await this.contextBuilder.buildForCompress(conversationId, toCompress);
    const summary = await this.llm.completeContext(ctx);

    const startId = toCompress.start_message_id!;
    const endId = toCompress.end_message_id!;

    await this.rollingSummaryRepo.save(
      this.rollingSummaryRepo.create({
        id: ulid(),
        conversationId,
        start_message_id: startId,
        end_message_id: endId,
        content: summary,
      }),
    );

    await this.messageRepo.update(
      { conversationId, id: Between(startId, endId) },
      { archived: true },
    );

    this.logger.log(`Compressed conversation ${conversationId}`);
  }

  private async extractPreferences(conversationId: string, userId: string): Promise<void> {
    const existing = await this.goalMemoryRepo.findOne({ where: { userId } });

    // Incremental slice: only rows past this conversation's watermark. ULIDs
    // sort lexicographically by creation time, so id comparison is exact and
    // unchanged history never triggers an LLM call.
    const since = existing?.extractedUpto?.[conversationId] ?? '';
    const messages = await this.messageRepo.find({
      where: { conversationId, id: MoreThan(since) },
      order: { id: 'ASC' },
      take: 60,
    });
    if (!messages.length) return;

    // USER and ASSISTANT rows both carry conversation content — a transcript
    // without Quinn's lines cannot separate the user's own preferences from
    // confirmations of Quinn's suggestions. A poisoned row is skipped, not
    // fatal to the job.
    const lines: string[] = [];
    for (const m of messages) {
      if (!m.encryptedText) continue;
      try {
        const text = await this.crypto.decrypt(m.encryptedText);
        if (text.trim()) lines.push(`${m.role === 'USER' ? 'User' : 'Quinn'}: ${text}`);
      } catch (err) {
        this.logger.warn(`Skipping undecryptable message ${m.id}: ${err}`);
      }
    }

    const existingJson = existing
      ? JSON.stringify({
          targetRoles: existing.targetRoles,
          targetIndustries: existing.targetIndustries,
          locationPrefs: existing.locationPrefs,
          dealBreakers: existing.dealBreakers,
          preferredStages: existing.preferredStages,
          salaryFloorUsd: existing.salaryFloorUsd,
          shortTermGoal: existing.shortTermGoal,
        })
      : '{}';

    const parsed = lines.length
      ? await this.llm.structuredComplete(
          {
            systemPrompt: GOAL_EXTRACTION_SYSTEM_PROMPT,
            messages: [
              {
                role: 'user',
                content: `Existing preferences: ${existingJson}\n\nConversation transcript:\n${lines.join('\n')}`,
                timestamp: Date.now(),
              },
            ],
          },
          GoalExtractionSchema,
        )
      : null;

    // Structured fields: the model returns the full updated value for the new
    // slice — overwrite when present, keep the accumulated value otherwise.
    // Empty array / null / "" mean "no new evidence", not "erase".
    // rawStatements keeps union semantics: it accumulates exact user phrases
    // across slices.
    const merged = {
      userId,
      targetRoles: overwriteArr(existing?.targetRoles, parsed?.targetRoles),
      targetIndustries: overwriteArr(existing?.targetIndustries, parsed?.targetIndustries),
      locationPrefs: overwriteArr(existing?.locationPrefs, parsed?.locationPrefs),
      dealBreakers: overwriteArr(existing?.dealBreakers, parsed?.dealBreakers),
      preferredStages: overwriteArr(existing?.preferredStages, parsed?.preferredStages),
      salaryFloorUsd: parsed?.salaryFloorUsd ?? existing?.salaryFloorUsd ?? null,
      shortTermGoal: parsed?.shortTermGoal || existing?.shortTermGoal || null,
      rawStatements: mergeStringArray(existing?.rawStatements, parsed?.rawStatements),
    };

    await this.goalMemoryRepo.upsert(
      {
        ...merged,
        extractedUpto: {
          ...(existing?.extractedUpto ?? {}),
          [conversationId]: messages[messages.length - 1].id,
        },
      } as UserGoalMemory,
      ['userId'],
    );
    this.logger.log(`Goal memory updated for user ${userId}`);
  }

  private async embedMaterial(materialId: string): Promise<void> {
    const material = await this.materialRepo.findOne({ where: { id: materialId } });
    if (!material || !material.shiningText) return;

    const embedding = await this.llm.embed(material.shiningText);
    await this.materialRepo.update(materialId, { embedding });
  }

  private async backfillEmbeddings(userId: string): Promise<void> {
    const materials = await this.materialRepo.find({
      where: { userId, status: 'CONFIRMED', embedding: IsNull() },
    });

    this.logger.log(`Backfilling ${materials.length} materials for user ${userId}`);

    for (const m of materials) {
      if (!m.shiningText) continue;
      try {
        const embedding = await this.llm.embed(m.shiningText);
        await this.materialRepo.update(m.id, { embedding });
        await sleep(100);
      } catch (err) {
        this.logger.warn(`Failed to embed material ${m.id}: ${err}`);
      }
    }
  }
}

function overwriteArr(current: string[] | undefined, incoming: unknown): string[] {
  return Array.isArray(incoming) && incoming.length ? (incoming as string[]) : (current ?? []);
}

function mergeStringArray(existing: string[] | undefined, incoming: unknown): string[] {
  const base = existing ?? [];
  if (!Array.isArray(incoming)) return base;
  return Array.from(new Set([...base, ...(incoming as string[])]));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}