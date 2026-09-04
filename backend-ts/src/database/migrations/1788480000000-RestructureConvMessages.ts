import { type MigrationInterface, type QueryRunner } from 'typeorm';

/**
 * conv_messages restructure — docs/tech/conv-messages-restructure.md.
 *
 * DESTRUCTIVE: pre-launch cutover — existing conversation content is
 * discarded by design. Old ASSISTANT/TOOL_RESULT content exists only in the
 * plaintext `payload` jsonb; keeping it would defeat the encryption boundary
 * this refactor establishes. Rolling summaries reference conv_messages ids
 * and are cleared with it.
 *
 * - `role` narrows to speakers (USER | ASSISTANT); tool invocations move to
 *   the new `conv_tool_calls` table (one row per call: arguments + result,
 *   atomic, paired via assistantId).
 * - `encryptedText` stays; ghost column `text` (always null) and plaintext
 *   struct-mirror `payload` are dropped; `encryptedThinking` and plaintext
 *   non-sensitive `metadata` are added.
 *
 * down() restores the schema only — the deleted content is unrecoverable.
 */
export class RestructureConvMessages1788480000000 implements MigrationInterface {
  name = 'RestructureConvMessages1788480000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM "conv_rolling_summary"`);
    await queryRunner.query(`DELETE FROM "conv_messages"`);

    await queryRunner.query(`CREATE TABLE "conv_tool_calls" ("id" character varying(26) NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(), "conversationId" character varying(26) NOT NULL, "assistantId" character varying(26) NOT NULL, "toolCallId" character varying(255) NOT NULL, "toolName" character varying(255) NOT NULL, "seq" integer NOT NULL, "encryptedArguments" bytea NOT NULL, "encryptedResult" bytea NOT NULL, "isError" boolean NOT NULL, CONSTRAINT "PK_conv_tool_calls" PRIMARY KEY ("id"))`);
    await queryRunner.query(`CREATE INDEX "IDX_conv_tool_calls_conversation" ON "conv_tool_calls" ("conversationId") `);
    await queryRunner.query(`CREATE INDEX "IDX_conv_tool_calls_assistant" ON "conv_tool_calls" ("assistantId") `);
    await queryRunner.query(`CREATE INDEX "IDX_conv_tool_calls_toolCall" ON "conv_tool_calls" ("toolCallId") `);

    await queryRunner.query(`ALTER TABLE "conv_messages" ADD "encryptedThinking" bytea`);
    await queryRunner.query(`ALTER TABLE "conv_messages" ADD "metadata" jsonb`);
    await queryRunner.query(`ALTER TABLE "conv_messages" DROP COLUMN "text"`);
    await queryRunner.query(`ALTER TABLE "conv_messages" DROP COLUMN "payload"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "conv_messages" ADD "text" text`);
    await queryRunner.query(`ALTER TABLE "conv_messages" ADD "payload" jsonb`);
    await queryRunner.query(`ALTER TABLE "conv_messages" DROP COLUMN "metadata"`);
    await queryRunner.query(`ALTER TABLE "conv_messages" DROP COLUMN "encryptedThinking"`);

    await queryRunner.query(`DROP INDEX "public"."IDX_conv_tool_calls_toolCall"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_conv_tool_calls_assistant"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_conv_tool_calls_conversation"`);
    await queryRunner.query(`DROP TABLE "conv_tool_calls"`);
  }
}
