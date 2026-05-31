import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddEncryptedMessageTextColumn1780096000000 implements MigrationInterface {
  name = 'AddEncryptedMessageTextColumn1780096000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add encrypted_text column
    await queryRunner.query(
      `ALTER TABLE "conv_messages" ADD "encryptedText" bytea`,
    );

    // Backfill of existing rows is omitted — encryptedText for pre-migration
    // messages will be NULL until re-encrypted by the application layer.
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "conv_messages" DROP COLUMN "encryptedText"`);
  }
}
