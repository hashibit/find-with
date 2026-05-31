import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class AddAccountPurgeSagaTable1780099000000 implements MigrationInterface {
  name = 'AddAccountPurgeSagaTable1780099000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "iam_account_purge_sagas" (
        "id" character varying(26) NOT NULL,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        "userId" character varying(26) NOT NULL,
        "step" character varying(50) NOT NULL DEFAULT 'INITIATED',
        "expiresAt" TIMESTAMP WITH TIME ZONE,
        "cancelled" boolean NOT NULL DEFAULT false,
        "stepResults" jsonb,
        "deadLetterRunbookUrl" text,
        "errorMessage" text,
        CONSTRAINT "PK_iam_account_purge_sagas" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_iam_account_purge_sagas_userId" ON "iam_account_purge_sagas" ("userId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_iam_account_purge_sagas_userId"`);
    await queryRunner.query(`DROP TABLE "iam_account_purge_sagas"`);
  }
}
