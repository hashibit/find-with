import { type MigrationInterface, type QueryRunner } from 'typeorm';

/** Keep encrypted tool-call rows attached to their assistant message lifetime. */
export class AddConvToolCallForeignKey1789200000000 implements MigrationInterface {
  name = 'AddConvToolCallForeignKey1789200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM "conv_tool_calls" t WHERE NOT EXISTS (SELECT 1 FROM "conv_messages" m WHERE m."id" = t."assistantId")`,
    );
    await queryRunner.query(
      `ALTER TABLE "conv_tool_calls" ADD CONSTRAINT "FK_conv_tool_calls_assistant" FOREIGN KEY ("assistantId") REFERENCES "conv_messages"("id") ON DELETE CASCADE`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "conv_tool_calls" DROP CONSTRAINT "FK_conv_tool_calls_assistant"`,
    );
  }
}
