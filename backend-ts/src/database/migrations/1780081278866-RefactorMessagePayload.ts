import { type MigrationInterface, type QueryRunner } from "typeorm";

export class RefactorMessagePayload1780081278866 implements MigrationInterface {
    name = 'RefactorMessagePayload1780081278866'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "conv_messages" DROP COLUMN "toolCalls"`);
        await queryRunner.query(`ALTER TABLE "conv_messages" DROP COLUMN "toolResult"`);
        await queryRunner.query(`ALTER TABLE "conv_messages" DROP COLUMN "tokenPrompt"`);
        await queryRunner.query(`ALTER TABLE "conv_messages" DROP COLUMN "tokenCompletion"`);
        await queryRunner.query(`ALTER TABLE "conv_messages" DROP COLUMN "tokenCostUsd"`);
        await queryRunner.query(`ALTER TABLE "conv_messages" DROP COLUMN "meta"`);
        await queryRunner.query(`ALTER TABLE "conv_messages" DROP COLUMN "tokenModel"`);
        await queryRunner.query(`ALTER TABLE "conv_messages" DROP COLUMN "finishReason"`);
        await queryRunner.query(`ALTER TABLE "conv_messages" ADD "payload" jsonb`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "conv_messages" DROP COLUMN "payload"`);
        await queryRunner.query(`ALTER TABLE "conv_messages" ADD "finishReason" character varying(20)`);
        await queryRunner.query(`ALTER TABLE "conv_messages" ADD "tokenModel" character varying(50)`);
        await queryRunner.query(`ALTER TABLE "conv_messages" ADD "meta" jsonb`);
        await queryRunner.query(`ALTER TABLE "conv_messages" ADD "tokenCostUsd" double precision`);
        await queryRunner.query(`ALTER TABLE "conv_messages" ADD "tokenCompletion" integer`);
        await queryRunner.query(`ALTER TABLE "conv_messages" ADD "tokenPrompt" integer`);
        await queryRunner.query(`ALTER TABLE "conv_messages" ADD "toolResult" jsonb`);
        await queryRunner.query(`ALTER TABLE "conv_messages" ADD "toolCalls" jsonb`);
    }

}
