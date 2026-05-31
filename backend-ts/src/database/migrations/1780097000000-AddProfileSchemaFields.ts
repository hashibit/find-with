import { type MigrationInterface, type QueryRunner } from 'typeorm';

/**
 * Adds fields missing from v0.1 profile schema relative to PRD:
 *   - work_experiences: isCurrent, isRemote, employmentType
 *   - education: isCurrentlyEnrolled
 */
export class AddProfileSchemaFields1780097000000 implements MigrationInterface {
  name = 'AddProfileSchemaFields1780097000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "profile_work_experiences"
        ADD COLUMN IF NOT EXISTS "isCurrent"       boolean NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS "isRemote"         boolean,
        ADD COLUMN IF NOT EXISTS "employmentType"   varchar(20)
    `);

    await queryRunner.query(`
      ALTER TABLE "profile_education"
        ADD COLUMN IF NOT EXISTS "isCurrentlyEnrolled" boolean NOT NULL DEFAULT false
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "profile_work_experiences"
        DROP COLUMN IF EXISTS "isCurrent",
        DROP COLUMN IF EXISTS "isRemote",
        DROP COLUMN IF EXISTS "employmentType"
    `);

    await queryRunner.query(`
      ALTER TABLE "profile_education"
        DROP COLUMN IF EXISTS "isCurrentlyEnrolled"
    `);
  }
}
