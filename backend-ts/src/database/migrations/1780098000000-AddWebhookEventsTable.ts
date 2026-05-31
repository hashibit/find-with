import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class AddWebhookEventsTable1780098000000 implements MigrationInterface {
  name = 'AddWebhookEventsTable1780098000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "iam_webhook_events" (
        "id" character varying(26) NOT NULL,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        "provider" character varying(50) NOT NULL,
        "eventId" character varying(255) NOT NULL,
        "eventType" character varying(100) NOT NULL,
        "processedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        CONSTRAINT "PK_iam_webhook_events" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_iam_webhook_events_provider_eventId" ON "iam_webhook_events" ("provider", "eventId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_iam_webhook_events_provider_eventId"`);
    await queryRunner.query(`DROP TABLE "iam_webhook_events"`);
  }
}
