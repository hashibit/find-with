import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Type } from '@sinclair/typebox';
import { JobMatchResult } from '../../database/entities/jobs/match-result.entity.js';
import { JobRadarItem } from '../../database/entities/jobs/radar-item.entity.js';
import { JobParsedJd } from '../../database/entities/jobs/parsed-jd.entity.js';
import { ProfileMaterial } from '../../database/entities/profile/material.entity.js';

export const RECOMPUTE_MATCH_TOOL_NAME = 'recompute_match';

// Number of top-scoring materials to use for deep match scoring (mirrors jobs.processor.ts).
const TOP_K = 8;

@Injectable()
export class RecomputeMatchTool {
  constructor(
    @InjectRepository(JobRadarItem)
    private readonly radarRepo: Repository<JobRadarItem>,
    @InjectRepository(JobMatchResult)
    private readonly matchRepo: Repository<JobMatchResult>,
    @InjectRepository(JobParsedJd)
    private readonly jdRepo: Repository<JobParsedJd>,
    @InjectRepository(ProfileMaterial)
    private readonly materialRepo: Repository<ProfileMaterial>,
  ) {}

  readonly name = RECOMPUTE_MATCH_TOOL_NAME;
  readonly description =
    'Recompute the three-layer match score for a radar item after materials have been updated.';
  readonly parameters = Type.Object({
    radar_item_id: Type.String({ description: 'ID of the radar item to recompute scores for' }),
  });

  async execute(
    _toolCallId: string,
    params: { radar_item_id: string },
    context: { userId: string; conversationId: string },
  ): Promise<{ content: Array<{ type: 'text'; text: string }>; details: Record<string, unknown> }> {
    const { radar_item_id } = params;
    const { userId } = context;

    const radarItem = await this.radarRepo.findOne({ where: { id: radar_item_id, userId } });
    if (!radarItem) {
      return {
        content: [{ type: 'text', text: `Radar item ${radar_item_id} not found.` }],
        details: { error: 'not_found' },
      };
    }

    if (!radarItem.parsedJdId) {
      return {
        content: [{ type: 'text', text: 'Radar item has no parsed JD yet. Analysis may still be pending.' }],
        details: { error: 'no_parsed_jd' },
      };
    }

    const parsedJd = await this.jdRepo.findOne({ where: { id: radarItem.parsedJdId } });
    if (!parsedJd) {
      return {
        content: [{ type: 'text', text: 'Parsed JD not found.' }],
        details: { error: 'parsed_jd_missing' },
      };
    }

    const matchResult = await this.matchRepo.findOne({ where: { parsedJdId: radarItem.parsedJdId } });
    if (!matchResult) {
      return {
        content: [{ type: 'text', text: 'No match result found for this radar item.' }],
        details: { error: 'match_result_missing' },
      };
    }

    // Load confirmed materials for the user
    const materials = await this.materialRepo.find({
      where: [
        { userId, status: 'CONFIRMED' },
        { userId, status: 'USER_EDITED' },
      ],
    });

    const hardSkills = (parsedJd.hardSkills as string[] | null) ?? [];

    // Reconstruct the JD text for surface match from capture — we only have
    // hardSkills here, so surface scoring uses the same keyword approach as the processor.
    const surfaceHits = hardSkills.filter((s) =>
      hardSkills.some((skill) => skill.toLowerCase() === s.toLowerCase()),
    );

    // Layer 1: surface score from JD hard skills matched against skills list
    // (We re-use the same formula: hits / total * 100)
    // Since we don't have the original capture text here, we measure how many
    // hard skills appear in the parsedJd's own hardSkills list (all of them),
    // which always equals 100% — instead, reuse existing surfaceScore and only
    // recompute deep score where materials have changed.
    //
    // For a proper surface recompute we'd need the original capture text.
    // We keep the existing surfaceScore and only update deepScore + gaps.
    const existingSurfaceScore = matchResult.surfaceScore ?? 0;

    let deepScore = 0;
    let deepHits: string[] = [];
    const jdEmbedding = parsedJd.jdEmbedding ?? null;

    if (jdEmbedding && materials.some((m) => m.embedding && m.embedding.length > 0)) {
      const materialScores = materials
        .filter((m) => m.embedding && m.embedding.length > 0)
        .map((m) => ({
          material: m,
          score: this.cosineSimilarity(jdEmbedding, m.embedding!),
          text: (m.shiningText ?? '') + ' ' + (m.tags ?? []).join(' '),
        }))
        .sort((a, b) => b.score - a.score);

      const topK = materialScores.slice(0, TOP_K);
      if (topK.length > 0) {
        const avgSimilarity = topK.reduce((sum, m) => sum + m.score, 0) / topK.length;
        deepScore = Math.max(0, Math.round(avgSimilarity * 100));
      }

      const topMaterialTexts = topK.map((m) => m.text.toLowerCase()).join(' ');
      deepHits = hardSkills.filter((s) => topMaterialTexts.includes(s.toLowerCase()));
    } else {
      const materialTexts = materials
        .map((m) => (m.shiningText ?? '') + ' ' + (m.tags ?? []).join(' '))
        .join(' ')
        .toLowerCase();
      deepHits = hardSkills.filter((s) => materialTexts.includes(s.toLowerCase()));
      deepScore =
        hardSkills.length > 0
          ? (Math.max(existingSurfaceScore / 100 * hardSkills.length, deepHits.length) / hardSkills.length) * 100
          : 0;
      deepScore = Math.round(deepScore);
    }

    const gaps = hardSkills.filter(
      (s) => !deepHits.includes(s) && !(matchResult.hitsSurface as string[] ?? []).includes(s),
    );

    matchResult.deepScore = deepScore;
    matchResult.hitsDeep = deepHits;
    matchResult.gaps = gaps.slice(0, 10);
    matchResult.adviceRationale = `Recomputed: surface=${existingSurfaceScore}%, deep=${deepScore}% (${materials.length} confirmed materials)`;

    await this.matchRepo.save(matchResult);

    const result = {
      surfaceScore: existingSurfaceScore,
      deepScore,
      gaps: gaps.slice(0, 10),
    };

    return {
      content: [
        {
          type: 'text',
          text: `Match recomputed for radar item ${radar_item_id}:\n- Surface: ${existingSurfaceScore}%\n- Deep: ${deepScore}%\n- Gaps: ${gaps.slice(0, 5).join(', ') || 'none'}`,
        },
      ],
      details: result,
    };
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    let dot = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i]! * b[i]!;
      normA += a[i]! * a[i]!;
      normB += b[i]! * b[i]!;
    }
    if (normA === 0 || normB === 0) return 0;
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
  }
}
