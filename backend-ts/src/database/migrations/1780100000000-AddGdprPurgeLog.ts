import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class AddGdprPurgeLog1780100000000 implements MigrationInterface {
  name = 'AddGdprPurgeLog1780100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "gdpr_purge_log" (
        "id" character varying(26) NOT NULL,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        "userId" character varying(26) NOT NULL,
        "purgedAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        "deletedRowCounts" jsonb,
        CONSTRAINT "PK_gdpr_purge_log" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_gdpr_purge_log_userId" ON "gdpr_purge_log" ("userId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_gdpr_purge_log_userId"`);
    await queryRunner.query(`DROP TABLE "gdpr_purge_log"`);
  }
}
