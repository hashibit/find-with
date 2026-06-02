import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, Inject } from '@nestjs/common';
import { Job } from 'bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, IsNull, Repository } from 'typeorm';
import { ulid } from 'ulid';

import { ConvMessage } from '../../database/entities/conversation/message.entity.js';
import { ConvRollingSummary } from '../../database/entities/conversation/rolling-summary.entity.js';
import { ProfileMaterial } from '../../database/entities/profile/material.entity.js';
import { UserGoalMemory } from '../../database/entities/memory/user-goal-memory.entity.js';
import { LLM_PROVIDER, type LlmProvider } from '../../llm/llm-provider.interface.js';
import { ContextBuilderService } from '../../agent/context-builder.service.js';
import { MEMORY_QUEUE, type MemoryJobData } from './memory.constants.js';

const GOAL_EXTRACTION_SYSTEM_PROMPT = `Given the conversation transcript and the user's existing preferences, extract or update job search preferences.

Return JSON only:
{
  "targetRoles": ["..."],
  "targetIndustries": ["..."],
  "locationPrefs": ["..."],
  "dealBreakers": ["..."],
  "preferredStages": ["..."],
  "salaryFloorUsd": null,
  "shortTermGoal": "...",
  "rawStatements": ["direct quotes from user"]
}

Rules:
- Only include fields where there is clear evidence in this conversation
- Do NOT infer or hallucinate preferences not explicitly stated
- dealBreakers: things user said they explicitly do not want
- rawStatements: copy exact user phrases that reveal preferences
- Return empty arrays for fields with no evidence`;

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
    const messages = await this.messageRepo.find({
      where: { conversationId },
      order: { createdAt: 'ASC' },
      take: 60,
    });

    const transcript = messages
      .filter((m) => m.role === 'USER')
      .map((m) => m.text ?? '')
      .filter(Boolean)
      .join('\n');

    if (!transcript.trim()) return;

    const existing = await this.goalMemoryRepo.findOne({ where: { userId } });

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

    const result = await this.llm.completeContext({
      systemPrompt: GOAL_EXTRACTION_SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `Existing preferences: ${existingJson}\n\nConversation transcript:\n${transcript}`,
          timestamp: Date.now(),
        },
      ],
    });

    let parsed: Partial<UserGoalMemory> = {};
    try {
      const m = result.match(/\{[\s\S]*\}/);
      if (m) parsed = JSON.parse(m[0]) as Partial<UserGoalMemory>;
    } catch (err) {
      this.logger.error({ err, userId }, 'Failed to parse goal extraction JSON from LLM — retrying via BullMQ');
      throw err;
    }

    const merged = {
      userId,
      targetRoles: mergeStringArray(existing?.targetRoles, parsed.targetRoles),
      targetIndustries: mergeStringArray(existing?.targetIndustries, parsed.targetIndustries),
      locationPrefs: mergeStringArray(existing?.locationPrefs, parsed.locationPrefs),
      dealBreakers: mergeStringArray(existing?.dealBreakers, parsed.dealBreakers),
      preferredStages: mergeStringArray(existing?.preferredStages, parsed.preferredStages),
      salaryFloorUsd: parsed.salaryFloorUsd ?? existing?.salaryFloorUsd ?? null,
      shortTermGoal: parsed.shortTermGoal ?? existing?.shortTermGoal ?? null,
      rawStatements: mergeStringArray(existing?.rawStatements, parsed.rawStatements),
    };

    await this.goalMemoryRepo.upsert(merged as UserGoalMemory, ['userId']);
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

function mergeStringArray(existing: string[] | undefined, incoming: unknown): string[] {
  const base = existing ?? [];
  if (!Array.isArray(incoming)) return base;
  return Array.from(new Set([...base, ...(incoming as string[])]));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
