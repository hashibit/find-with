import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPendingToolResultsTable1780095000000 implements MigrationInterface {
  name = 'AddPendingToolResultsTable1780095000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "pending_tool_results" ("id" character varying(26) NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(), "conversationId" character varying(26) NOT NULL, "toolName" character varying(100) NOT NULL, "toolCallId" character varying(64) NOT NULL, "result" jsonb, "error" jsonb, "acknowledged" boolean NOT NULL DEFAULT 'false', CONSTRAINT "PK_8a9e5b50c24e1c8e4e0a7b2e4e3" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_pending_tool_conversation" ON "pending_tool_results" ("conversationId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_pending_tool_call_id" ON "pending_tool_results" ("toolCallId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_pending_tool_call_id"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_pending_tool_conversation"`);
    await queryRunner.query(`DROP TABLE "pending_tool_results"`);
  }
}
