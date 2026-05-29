import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class AddArchivedToMessage1780076958628 implements MigrationInterface {
  name = 'AddArchivedToMessage1780076958628';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "conv_messages" ADD "archived" boolean NOT NULL DEFAULT false`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "conv_messages" DROP COLUMN "archived"`);
  }
}
