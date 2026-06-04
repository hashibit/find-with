import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class AddAdminAuditLog1780101000000 implements MigrationInterface {
  name = 'AddAdminAuditLog1780101000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "admin_audit_logs" (
        "id" varchar(26) NOT NULL,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "action" varchar(100) NOT NULL,
        "targetId" varchar(255) NOT NULL,
        "note" text NULL,
        CONSTRAINT "PK_admin_audit_logs" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_admin_audit_logs_action_createdAt" ON "admin_audit_logs" ("action", "createdAt")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_admin_audit_logs_targetId" ON "admin_audit_logs" ("targetId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_admin_audit_logs_targetId"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_admin_audit_logs_action_createdAt"`);
    await queryRunner.query(`DROP TABLE "admin_audit_logs"`);
  }
}
