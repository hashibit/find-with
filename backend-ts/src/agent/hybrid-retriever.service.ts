import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProfileMaterial } from '../database/entities/profile/material.entity.js';
import { cosineSimilarity } from '../common/math.js';

/**
 * A single retrieval result with its source, score, and traceability info.
 */
export interface RetrievalResult {
  material: ProfileMaterial;
  /** Combined RRF score (semantic path) or keyword score (fallback path). */
  score: number;
  /** Dense (embedding) similarity score, if available. */
  denseScore?: number;
  /** Sparse (FTS) relevance score, if available. */
  sparseScore?: number;
  /** Which retrieval path contributed most. */
  primarySource: 'dense' | 'sparse' | 'both';
  /** Raw RRF score before any post-processing (for diagnostics). */
  rrfScore?: number;
}

/**
 * HybridRetrieverService combines dense (pgvector) and sparse (PostgreSQL FTS)
 * retrieval with Reciprocal Rank Fusion (RRF) for semantic material search.
 *
 * Architecture:
 *   Query
 *     ├─ Dense:  pgvector <=> cosine distance (semantic similarity)
 *     ├─ Sparse: PostgreSQL ts_rank over tsvector (keyword matching)
 *     └─ RRF:    Merge ranked lists with reciprocal rank fusion
 *
 * This replaces the previous single-path cosine-only ranking in
 * SemanticMaterialLoaderService with a proper hybrid pipeline.
 *
 * Citations: each returned result includes its dense/sparse scores and
 * primary source, enabling the UI to show "why this material was selected."
 */
@Injectable()
export class HybridRetrieverService {
  private readonly logger = new Logger(HybridRetrieverService.name);

  /** RRF constant k — prevents division by zero and controls rank weight decay. */
  static readonly RRF_K = 60;

  /** Default number of results to return. */
  static readonly DEFAULT_TOP_K = 8;

  constructor(
    @InjectRepository(ProfileMaterial)
    private readonly repo: Repository<ProfileMaterial>,
  ) {}

  /**
   * Hybrid retrieval: dense + sparse → RRF fusion → sorted results.
   *
   * @param userId        The user whose materials to search.
   * @param queryText     Natural language query text (for sparse/FTS path).
   * @param jdEmbedding   JD embedding vector (for dense/pgvector path).
   * @param statuses      Material statuses to include.
   * @param topK          Number of results to return.
   */
  async retrieve(
    userId: string,
    queryText: string,
    jdEmbedding: number[] | null,
    statuses: Array<'CONFIRMED' | 'USER_EDITED' | 'PROPOSED'>,
    topK: number = HybridRetrieverService.DEFAULT_TOP_K,
  ): Promise<RetrievalResult[]> {
    // Run dense and sparse retrieval in parallel
    const [denseResults, sparseResults] = await Promise.all([
      this.denseRetrieve(userId, jdEmbedding, statuses, topK * 2),
      this.sparseRetrieve(userId, queryText, statuses, topK * 2),
    ]);

    // If dense returned nothing (no embedding), fall back to sparse only
    if (denseResults.length === 0 && sparseResults.length === 0) {
      return [];
    }
    if (denseResults.length === 0) {
      return sparseResults.slice(0, topK).map((r) => ({
        ...r,
        primarySource: 'sparse' as const,
      }));
    }
    if (sparseResults.length === 0) {
      return denseResults.slice(0, topK).map((r) => ({
        ...r,
        denseScore: r.score,
        primarySource: 'dense' as const,
      }));
    }

    // Reciprocal Rank Fusion
    const fused = this.reciprocalRankFusion(denseResults, sparseResults);
    return fused.slice(0, topK);
  }

  // ── Dense retrieval (pgvector cosine similarity) ────────────

  private async denseRetrieve(
    userId: string,
    jdEmbedding: number[] | null,
    statuses: string[],
    topK: number,
  ): Promise<RetrievalResult[]> {
    if (!jdEmbedding || jdEmbedding.length === 0) return [];

    const all = await this.repo.find({
      where: statuses.map((status) => ({ userId, status })),
    });

    return all
      .filter((m) => m.embedding && m.embedding.length > 0)
      .map((m) => ({
        material: m,
        score: cosineSimilarity(jdEmbedding, m.embedding!),
        denseScore: cosineSimilarity(jdEmbedding, m.embedding!),
        primarySource: 'dense' as const,
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }

  // ── Sparse retrieval (PostgreSQL FTS) ──────────────────────

  private async sparseRetrieve(
    userId: string,
    queryText: string,
    statuses: string[],
    topK: number,
  ): Promise<RetrievalResult[]> {
    if (!queryText || queryText.trim().length === 0) return [];

    // Build a PostgreSQL ts_query from the query text.
    // Normalize: lowercase, strip special chars, join with & for AND semantics.
    const tokens = queryText
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length > 1)
      .slice(0, 32); // Limit query terms to prevent bloated queries
    if (tokens.length === 0) return [];

    const tsQuery = tokens.map((t) => `${t}:*`).join(' & ');

    try {
      // Use PostgreSQL ts_rank to score materials by FTS relevance.
      // The search_vector column must be populated by a DB trigger/index.
      const results = await this.repo
        .createQueryBuilder('m')
        .where('m.userId = :userId', { userId })
        .andWhere('m.status IN (:...statuses)', { statuses })
        .andWhere("m.search_vector IS NOT NULL AND m.search_vector @@ to_tsquery('english', :tsQuery)", { tsQuery })
        .addSelect("ts_rank(m.search_vector, to_tsquery('english', :tsQuery))", 'fts_rank')
        .orderBy('fts_rank', 'DESC')
        .limit(topK)
        .getMany();

      return results.map((m) => ({
        material: m,
        score: ((m as unknown as { fts_rank?: number }).fts_rank ?? 0.5),
        sparseScore: ((m as unknown as { fts_rank?: number }).fts_rank ?? 0.5),
        primarySource: 'sparse' as const,
      }));
    } catch (err) {
      // search_vector column might not exist yet — graceful degradation
      this.logger.warn(
        `FTS retrieval failed (column may not exist): ${(err as Error).message}`,
      );
      return [];
    }
  }

  // ── Reciprocal Rank Fusion ──────────────────────────────────

  /**
   * Merge two ranked lists using RRF.
   *
   * For each document, compute:
   *   RRF(d) = Σ 1 / (k + rank_i(d))
   *
   * where rank_i(d) is the position of document d in list i,
   * and k is a constant (default 60) that mitigates high rank variance.
   */
  private reciprocalRankFusion(
    denseList: RetrievalResult[],
    sparseList: RetrievalResult[],
  ): RetrievalResult[] {
    const materialMap = new Map<string, RetrievalResult>();

    // Build lookup by material ID
    for (const r of denseList) {
      materialMap.set(r.material.id, {
        ...r,
        rrfScore: 0,
        denseScore: r.score,
      });
    }
    for (const r of sparseList) {
      if (materialMap.has(r.material.id)) {
        materialMap.get(r.material.id)!.sparseScore = r.score;
        materialMap.get(r.material.id)!.primarySource = 'both';
      } else {
        materialMap.set(r.material.id, {
          ...r,
          rrfScore: 0,
          sparseScore: r.score,
        });
      }
    }

    // Compute RRF scores
    const fused: RetrievalResult[] = [];
    for (const result of materialMap.values()) {
      let rrf = 0;
      if (result.denseScore !== undefined) {
        const denseRank = denseList.findIndex((r) => r.material.id === result.material.id) + 1;
        rrf += 1 / (HybridRetrieverService.RRF_K + denseRank);
      }
      if (result.sparseScore !== undefined) {
        const sparseRank = sparseList.findIndex((r) => r.material.id === result.material.id) + 1;
        rrf += 1 / (HybridRetrieverService.RRF_K + sparseRank);
      }
      result.rrfScore = rrf;
      // Normalize RRF score to 0-1 range for the final score
      // Max possible RRF per list: 1/(60+1) ≈ 0.016. Two lists: max ≈ 0.032.
      // Scale for readability
      result.score = Math.round(rrf * 10000) / 100;
      fused.push(result);
    }

    return fused.sort((a, b) => b.score - a.score);
  }
}
