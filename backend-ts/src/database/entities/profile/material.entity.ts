import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../base.entity.js';

@Entity('profile_materials')
export class ProfileMaterial extends BaseEntity {
  @Index()
  @Column({ type: 'varchar', length: 26 })
  userId: string;

  /**
   * AES-256-GCM encrypted bytes (nonce[12] + ciphertext).
   * §12.1: stored as bytea, never plaintext.
   */
  @Column({ type: 'bytea', nullable: true })
  rawText: Buffer | null;

  @Column({ type: 'text', nullable: true })
  shiningText: string | null;

  @Column({ type: 'text', nullable: true })
  rationale: string | null;

  @Column({ type: 'jsonb', nullable: true })
  tags: string[] | null;

  @Column({ type: 'jsonb', nullable: true })
  quant: Record<string, unknown> | null;

  @Column({ type: 'varchar', length: 20 })
  provenanceKind: string; // conversation | resume | manual

  @Column({ type: 'jsonb', nullable: true })
  provenanceData: Record<string, unknown> | null;

  @Column({ type: 'varchar', length: 20, default: 'PROPOSED' })
  status: string; // PROPOSED | CONFIRMED | USER_EDITED

  @Column({ type: 'varchar', length: 26, nullable: true })
  linkedExperienceId: string | null;

  /**
   * pgvector float4[1536] embedding — stored as jsonb fallback when
   * the extension is not available. The service layer handles the distinction.
   */
  @Column({ type: 'jsonb', nullable: true })
  embedding: number[] | null;
}
