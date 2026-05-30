import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class AddMemoryTables1780090000000 implements MigrationInterface {
  name = 'AddMemoryTables1780090000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Layer 2: rolling summary table
    await queryRunner.query(`
      CREATE TABLE "conv_rolling_summary" (
        "id" character varying(26) NOT NULL,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        "conversationId" character varying(26) NOT NULL,
        "start_message_id" character varying(26) NOT NULL,
        "end_message_id" character varying(26) NOT NULL,
        "content" text,
        CONSTRAINT "PK_conv_rolling_summary" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_conv_rolling_summary_conversation" ON "conv_rolling_summary" ("conversationId")`,
    );

    // Layer 4: user goal memory table
    await queryRunner.query(`
      CREATE TABLE "user_goal_memory" (
        "userId" character varying(26) NOT NULL,
        "targetRoles" jsonb NOT NULL DEFAULT '[]',
        "targetIndustries" jsonb NOT NULL DEFAULT '[]',
        "locationPrefs" jsonb NOT NULL DEFAULT '[]',
        "dealBreakers" jsonb NOT NULL DEFAULT '[]',
        "preferredStages" jsonb NOT NULL DEFAULT '[]',
        "salaryFloorUsd" integer,
        "shortTermGoal" text,
        "rawStatements" jsonb NOT NULL DEFAULT '[]',
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        CONSTRAINT "PK_user_goal_memory" PRIMARY KEY ("userId")
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "user_goal_memory"`);
    await queryRunner.query(`DROP INDEX "IDX_conv_rolling_summary_conversation"`);
    await queryRunner.query(`DROP TABLE "conv_rolling_summary"`);
  }
}
