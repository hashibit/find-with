import { type MigrationInterface, type QueryRunner } from 'typeorm';

/** Make tool execution claims durable and idempotent across retries/workers. */
export class AddToolCallExecutionState1789100000000 implements MigrationInterface {
  name = 'AddToolCallExecutionState1789100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "conv_tool_calls" ALTER COLUMN "encryptedResult" DROP NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "conv_tool_calls" ADD "status" character varying(20) NOT NULL DEFAULT 'SUCCEEDED'`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_conv_tool_calls_conversation_call" ON "conv_tool_calls" ("conversationId", "toolCallId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."UQ_conv_tool_calls_conversation_call"`);
    await queryRunner.query(`ALTER TABLE "conv_tool_calls" DROP COLUMN "status"`);
    await queryRunner.query(
      `ALTER TABLE "conv_tool_calls" ALTER COLUMN "encryptedResult" SET NOT NULL`,
    );
  }
}
