import { type MigrationInterface, type QueryRunner } from "typeorm";

export class AddEvalAndGuardrailTables1785897777466 implements MigrationInterface {
    name = 'AddEvalAndGuardrailTables1785897777466'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "tailoring_bullets" DROP CONSTRAINT "FK_tailoring_bullets_resume"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_iam_webhook_events_provider_eventId"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_iam_account_purge_sagas_userId"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_gdpr_purge_log_userId"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_pending_tool_conversation"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_pending_tool_call_id"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_conv_rolling_summary_conversation"`);
        await queryRunner.query(`DROP INDEX "public"."idx_tailoring_bullets_resume_id"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_admin_audit_logs_action_createdAt"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_admin_audit_logs_targetId"`);
        await queryRunner.query(`CREATE TABLE "parse_failure_logs" ("id" character varying(26) NOT NULL, "context" character varying(100) NOT NULL, "rawOutput" character varying(8000), "errorMessage" character varying(2000) NOT NULL, "attempt" integer NOT NULL DEFAULT '0', "timestamp" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_3b000788dedcfacd499297bd650" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_dbb6c1dd6970f97647439da3da" ON "parse_failure_logs" ("context") `);
        await queryRunner.query(`CREATE INDEX "IDX_39683002c14a5e6bbf205dc31d" ON "parse_failure_logs" ("timestamp") `);
        await queryRunner.query(`CREATE TABLE "token_usage_logs" ("id" character varying(26) NOT NULL, "userId" character varying(26), "endpoint" character varying(50) NOT NULL, "provider" character varying(20) NOT NULL, "model" character varying(50) NOT NULL, "inputTokens" integer NOT NULL, "outputTokens" integer NOT NULL, "cacheReadTokens" integer NOT NULL DEFAULT '0', "cacheWriteTokens" integer NOT NULL DEFAULT '0', "costUsd" numeric(12,6) NOT NULL, "providerTier" character varying(10) NOT NULL DEFAULT 'primary', "latencyMs" integer, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_0f51a06c15d65f1fa892089f602" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_93daf0b5f69af85252a07582e2" ON "token_usage_logs" ("userId") `);
        await queryRunner.query(`CREATE INDEX "IDX_bedf4ca442912a479e9456a1ca" ON "token_usage_logs" ("endpoint") `);
        await queryRunner.query(`CREATE INDEX "IDX_a9b2bd4b4924ab9c3620f7fc1d" ON "token_usage_logs" ("provider") `);
        await queryRunner.query(`CREATE INDEX "IDX_01d42af21724a6ce19c9f62880" ON "token_usage_logs" ("createdAt") `);
        await queryRunner.query(`CREATE TABLE "guardrail_logs" ("id" character varying(26) NOT NULL, "layer" character varying(30) NOT NULL, "rule" character varying(50) NOT NULL, "action" character varying(20) NOT NULL, "userId" character varying(26), "matchedSample" character varying(500), "context" character varying(200), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_85f5208aeb1003c9db2e5425d6a" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_a98f0aa63cc786ab17bbdc3afb" ON "guardrail_logs" ("userId") `);
        await queryRunner.query(`CREATE INDEX "IDX_1b4432a05e2abb4721fe22822f" ON "guardrail_logs" ("createdAt") `);
        await queryRunner.query(`ALTER TABLE "tailoring_bullets" ALTER COLUMN "sectionTitle" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "tailoring_bullets" ALTER COLUMN "position" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "tailoring_bullets" ALTER COLUMN "text" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "tailoring_bullets" ALTER COLUMN "source" DROP DEFAULT`);
        await queryRunner.query(`CREATE INDEX "IDX_e59a64aeabf324c64068250bf4" ON "conv_rolling_summary" ("conversationId") `);
        await queryRunner.query(`CREATE INDEX "IDX_66fe6c4d11ea435fad1c1fdd84" ON "tailoring_bullets" ("resumeId") `);
        await queryRunner.query(`CREATE INDEX "IDX_012968ba87e42d8907340e25e0" ON "admin_audit_logs" ("targetId") `);
        await queryRunner.query(`CREATE INDEX "IDX_13cafaf0d4501d0346888efc66" ON "admin_audit_logs" ("action", "createdAt") `);
        await queryRunner.query(`ALTER TABLE "iam_webhook_events" ADD CONSTRAINT "UQ_6ed52adb1a2b90dccee59abae55" UNIQUE ("provider", "eventId")`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "iam_webhook_events" DROP CONSTRAINT "UQ_6ed52adb1a2b90dccee59abae55"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_13cafaf0d4501d0346888efc66"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_012968ba87e42d8907340e25e0"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_66fe6c4d11ea435fad1c1fdd84"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_e59a64aeabf324c64068250bf4"`);
        await queryRunner.query(`ALTER TABLE "tailoring_bullets" ALTER COLUMN "source" SET DEFAULT 'MATERIAL'`);
        await queryRunner.query(`ALTER TABLE "tailoring_bullets" ALTER COLUMN "text" SET DEFAULT ''`);
        await queryRunner.query(`ALTER TABLE "tailoring_bullets" ALTER COLUMN "position" SET DEFAULT '0'`);
        await queryRunner.query(`ALTER TABLE "tailoring_bullets" ALTER COLUMN "sectionTitle" SET DEFAULT 'Work Experience'`);
        await queryRunner.query(`DROP INDEX "public"."IDX_1b4432a05e2abb4721fe22822f"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_a98f0aa63cc786ab17bbdc3afb"`);
        await queryRunner.query(`DROP TABLE "guardrail_logs"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_01d42af21724a6ce19c9f62880"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_a9b2bd4b4924ab9c3620f7fc1d"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_bedf4ca442912a479e9456a1ca"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_93daf0b5f69af85252a07582e2"`);
        await queryRunner.query(`DROP TABLE "token_usage_logs"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_39683002c14a5e6bbf205dc31d"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_dbb6c1dd6970f97647439da3da"`);
        await queryRunner.query(`DROP TABLE "parse_failure_logs"`);
        await queryRunner.query(`CREATE INDEX "IDX_admin_audit_logs_targetId" ON "admin_audit_logs" ("targetId") `);
        await queryRunner.query(`CREATE INDEX "IDX_admin_audit_logs_action_createdAt" ON "admin_audit_logs" ("createdAt", "action") `);
        await queryRunner.query(`CREATE INDEX "idx_tailoring_bullets_resume_id" ON "tailoring_bullets" ("resumeId") `);
        await queryRunner.query(`CREATE INDEX "IDX_conv_rolling_summary_conversation" ON "conv_rolling_summary" ("conversationId") `);
        await queryRunner.query(`CREATE INDEX "IDX_pending_tool_call_id" ON "pending_tool_results" ("toolCallId") `);
        await queryRunner.query(`CREATE INDEX "IDX_pending_tool_conversation" ON "pending_tool_results" ("conversationId") `);
        await queryRunner.query(`CREATE INDEX "IDX_gdpr_purge_log_userId" ON "gdpr_purge_log" ("userId") `);
        await queryRunner.query(`CREATE INDEX "IDX_iam_account_purge_sagas_userId" ON "iam_account_purge_sagas" ("userId") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_iam_webhook_events_provider_eventId" ON "iam_webhook_events" ("provider", "eventId") `);
        await queryRunner.query(`ALTER TABLE "tailoring_bullets" ADD CONSTRAINT "FK_tailoring_bullets_resume" FOREIGN KEY ("resumeId") REFERENCES "tailoring_resumes"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

}
