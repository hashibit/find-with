import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProfileMaterial } from '../../database/entities/profile/material.entity.js';

/**
 * MaterialManager is the single seam through which all Material reads flow.
 *
 * Background: the Material entity is the most load-bearing concept in FindWith —
 * it drives resume tailoring, deep match scoring, and Quinn's context. Its write
 * path is owned by ProfileProcessor (resume) and MineShiningPointTool
 * (conversation). Its read path was previously duplicated across JobsProcessor,
 * TailoringProcessor, and ContextBuilderService.
 *
 * Centralising reads here means:
 *   - Future relevance-ranking improvements touch one place.
 *   - Tests for processors can inject a fake MaterialManager and return
 *     fixed fixtures — no DB mock required.
 */
@Injectable()
export class MaterialManager {
  constructor(
    @InjectRepository(ProfileMaterial)
    private readonly repo: Repository<ProfileMaterial>,
  ) {}

  /** All confirmed materials for a user. The canonical read path. */
  async confirmedForUser(userId: string): Promise<ProfileMaterial[]> {
    return this.repo.find({
      where: { userId, status: 'CONFIRMED' },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Materials to use for resume tailoring.
   *
   * If the BaseResume specifies a selectedMaterialIds list, only those are
   * returned. Otherwise all confirmed materials are returned.
   */
  async forTailoring(
    userId: string,
    selectedMaterialIds: string[] | null,
  ): Promise<ProfileMaterial[]> {
    const all = await this.confirmedForUser(userId);
    if (!selectedMaterialIds || selectedMaterialIds.length === 0) return all;
    return all.filter((m) => selectedMaterialIds.includes(m.id));
  }
}
