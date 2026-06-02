import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Type } from '@sinclair/typebox';
import { JobMatchResult } from '../../database/entities/jobs/match-result.entity.js';
import { JobRadarItem } from '../../database/entities/jobs/radar-item.entity.js';
import { JobParsedJd } from '../../database/entities/jobs/parsed-jd.entity.js';
import { SemanticMaterialLoaderService } from '../semantic-material-loader.service.js';

export const RECOMPUTE_MATCH_TOOL_NAME = 'recompute_match';

@Injectable()
export class RecomputeMatchTool {
  constructor(
    @InjectRepository(JobRadarItem)
    private readonly radarRepo: Repository<JobRadarItem>,
    @InjectRepository(JobMatchResult)
    private readonly matchRepo: Repository<JobMatchResult>,
    @InjectRepository(JobParsedJd)
    private readonly jdRepo: Repository<JobParsedJd>,
    private readonly materialLoader: SemanticMaterialLoaderService,
  ) {}

  readonly name = RECOMPUTE_MATCH_TOOL_NAME;
  readonly scenes = ['JOB_ANALYSIS', 'TAILOR_EDIT'] as const;
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

    const hardSkills = (parsedJd.hardSkills as string[] | null) ?? [];
    const existingSurfaceScore = matchResult.surfaceScore ?? 0;

    let deepScore = 0;
    let deepHits: string[] = [];
    const jdEmbedding = parsedJd.jdEmbedding ?? null;

    if (jdEmbedding) {
      // Semantic path: rank CONFIRMED + USER_EDITED materials by cosine similarity to JD embedding.
      // RecomputeMatchTool includes USER_EDITED (unlike ContextBuilder which uses CONFIRMED only)
      // because edited materials reflect deliberate user refinement and should count toward the score.
      const ranked = await this.materialLoader.rankByEmbedding(
        userId,
        jdEmbedding,
        ['CONFIRMED', 'USER_EDITED'],
        SemanticMaterialLoaderService.TOP_K,
      );

      if (ranked.length > 0) {
        const avgSimilarity = ranked.reduce((sum, r) => sum + r.score, 0) / ranked.length;
        deepScore = Math.max(0, Math.round(avgSimilarity * 100));
      }

      const topMaterialTexts = ranked
        .map((r) => ((r.material.shiningText ?? '') + ' ' + (r.material.tags ?? []).join(' ')).toLowerCase())
        .join(' ');
      deepHits = hardSkills.filter((s) => topMaterialTexts.includes(s.toLowerCase()));
    } else {
      // No JD embedding — fall back to keyword match across all materials (including those without embeddings).
      const all = await this.materialLoader.loadAll(userId, ['CONFIRMED', 'USER_EDITED']);
      const materialTexts = all
        .map((m) => ((m.shiningText ?? '') + ' ' + (m.tags ?? []).join(' ')).toLowerCase())
        .join(' ');
      deepHits = hardSkills.filter((s) => materialTexts.includes(s.toLowerCase()));
      deepScore =
        hardSkills.length > 0
          ? (Math.max(
              (existingSurfaceScore / 100) * hardSkills.length,
              deepHits.length,
            ) /
              hardSkills.length) *
            100
          : 0;
      deepScore = Math.round(deepScore);
    }

    const gaps = hardSkills.filter(
      (s) => !deepHits.includes(s) && !(matchResult.hitsSurface as string[] ?? []).includes(s),
    );

    matchResult.deepScore = deepScore;
    matchResult.hitsDeep = deepHits;
    matchResult.gaps = gaps.slice(0, 10);
    matchResult.adviceRationale = `Recomputed: surface=${existingSurfaceScore}%, deep=${deepScore}%`;

    await this.matchRepo.save(matchResult);

    return {
      content: [
        {
          type: 'text',
          text: `Match recomputed for radar item ${radar_item_id}:\n- Surface: ${existingSurfaceScore}%\n- Deep: ${deepScore}%\n- Gaps: ${gaps.slice(0, 5).join(', ') || 'none'}`,
        },
      ],
      details: {
        surfaceScore: existingSurfaceScore,
        deepScore,
        gaps: gaps.slice(0, 10),
      },
    };
  }
}
