import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddEncryptedMessageTextColumn1780096000000 implements MigrationInterface {
  name = 'AddEncryptedMessageTextColumn1780096000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add encrypted_text column
    await queryRunner.query(
      `ALTER TABLE "conv_messages" ADD "encryptedText" bytea`,
    );

    // Copy existing text to encrypted_text (encrypted with dummy key for migration)
    // In production, this would use actual encryption
    await queryRunner.query(
      `UPDATE "conv_messages" SET "encryptedText" = pgp_encrypt(text::bytea, DecryptKey()) WHERE text IS NOT NULL`,
    );

    // Make text nullable (will keep for backward compatibility initially)
    // In a subsequent migration, we can drop text if needed
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "conv_messages" DROP COLUMN "encryptedText"`);
  }
}
