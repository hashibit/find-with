import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

@Entity('user_goal_memory')
export class UserGoalMemory {
  @PrimaryColumn({ type: 'varchar', length: 26 })
  userId: string;

  @Column({ type: 'jsonb', default: [] })
  targetRoles: string[];

  @Column({ type: 'jsonb', default: [] })
  targetIndustries: string[];

  @Column({ type: 'jsonb', default: [] })
  locationPrefs: string[];

  @Column({ type: 'jsonb', default: [] })
  dealBreakers: string[];

  @Column({ type: 'jsonb', default: [] })
  preferredStages: string[];

  @Column({ type: 'integer', nullable: true })
  salaryFloorUsd: number | null;

  @Column({ type: 'text', nullable: true })
  shortTermGoal: string | null;

  @Column({ type: 'jsonb', default: [] })
  rawStatements: string[];

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
