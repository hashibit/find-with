import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProfileMaterial } from '../database/entities/profile/material.entity.js';
import { cosineSimilarity } from '../common/math.js';

type MaterialStatus = 'CONFIRMED' | 'USER_EDITED';

export interface RankedMaterial {
  material: ProfileMaterial;
  score: number;
}

@Injectable()
export class SemanticMaterialLoaderService {
  /** Must match the TOP_K value previously duplicated in context-builder and recompute-match. */
  static readonly TOP_K = 8;
  /** Fallback limit when semantic ranking is unavailable or yields too few results. */
  static readonly FALLBACK_LIMIT = 20;

  constructor(
    @InjectRepository(ProfileMaterial)
    private readonly repo: Repository<ProfileMaterial>,
  ) {}

  /**
   * Load materials for a user, rank by cosine similarity to jdEmbedding, return top K with scores.
   *
   * No pre-cosine row limit — all matching materials are loaded before ranking.
   * Previously context-builder capped at 100 rows before ranking; that cap is removed here
   * to avoid silently truncating eligible materials for users with large libraries.
   *
   * @param statuses  Which statuses to include. ContextBuilder uses ['CONFIRMED'];
   *                  RecomputeMatchTool uses ['CONFIRMED', 'USER_EDITED'].
   * @param topK      How many top results to return (default: TOP_K = 8).
   */
  async rankByEmbedding(
    userId: string,
    jdEmbedding: number[],
    statuses: MaterialStatus[],
    topK = SemanticMaterialLoaderService.TOP_K,
  ): Promise<RankedMaterial[]> {
    const where = statuses.map((status) => ({ userId, status }));
    const all = await this.repo.find({ where });

    return all
      .filter((m) => m.embedding && m.embedding.length > 0)
      .map((m) => ({ material: m, score: cosineSimilarity(jdEmbedding, m.embedding!) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }

  /**
   * Load all materials for a user by status, without any ranking.
   * Used when no jdEmbedding is available and keyword matching is needed.
   */
  async loadAll(userId: string, statuses: MaterialStatus[]): Promise<ProfileMaterial[]> {
    const where = statuses.map((status) => ({ userId, status }));
    return this.repo.find({ where });
  }

  /**
   * ContextBuilder-specific wrapper.
   *
   * Attempts semantic ranking against jdEmbedding (CONFIRMED materials only).
   * Falls back to time-ordered top FALLBACK_LIMIT if:
   * - No jdEmbedding is available, or
   * - Semantic ranking returns fewer than 3 results.
   */
  async loadForPromptContext(
    userId: string,
    jdEmbedding: number[] | null,
  ): Promise<ProfileMaterial[]> {
    if (jdEmbedding) {
      const scored = await this.rankByEmbedding(userId, jdEmbedding, ['CONFIRMED']);
      if (scored.length >= 3) {
        return scored.map((s) => s.material);
      }
    }

    // Fallback: time-ordered top 20 (CONFIRMED only, matches original ContextBuilder behavior)
    return this.repo.find({
      where: { userId, status: 'CONFIRMED' },
      order: { createdAt: 'DESC' },
      take: SemanticMaterialLoaderService.FALLBACK_LIMIT,
    });
  }
}
