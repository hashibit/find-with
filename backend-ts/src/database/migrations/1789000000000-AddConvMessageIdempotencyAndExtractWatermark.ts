import { type MigrationInterface, type QueryRunner } from 'typeorm';

/**
 * Preference-extraction pipeline hardening:
 *
 * - conv_messages.clientMessageId — client-generated id for send-side
 *   idempotency. SSE re-sends of the same prompt (transport reconnect,
 *   UI double-fire) carry the same messageId and collapse to one row via
 *   the unique (conversationId, clientMessageId) index. Nullable: ASSISTANT
 *   rows and legacy USER rows have no client id, and Postgres treats NULLs
 *   as distinct in unique indexes.
 * - user_goal_memory.extractedUpto — per-conversation extraction watermark
 *   (last conv_messages ULID fed into preference extraction). ULIDs sort
 *   lexicographically by creation time, so `id > watermark` selects exactly
 *   the new slice.
 */
export class AddConvMessageIdempotencyAndExtractWatermark1789000000000 implements MigrationInterface {
  name = 'AddConvMessageIdempotencyAndExtractWatermark1789000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "conv_messages" ADD "clientMessageId" character varying(64)`);
    await queryRunner.query(`CREATE UNIQUE INDEX "UQ_conv_messages_client_msg" ON "conv_messages" ("conversationId", "clientMessageId")`);
    await queryRunner.query(`ALTER TABLE "user_goal_memory" ADD "extractedUpto" jsonb NOT NULL DEFAULT '{}'`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "user_goal_memory" DROP COLUMN "extractedUpto"`);
    // The unique index is dropped implicitly with its column.
    await queryRunner.query(`ALTER TABLE "conv_messages" DROP COLUMN "clientMessageId"`);
  }
}