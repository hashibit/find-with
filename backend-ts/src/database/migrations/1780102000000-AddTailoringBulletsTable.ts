import { type MigrationInterface, type QueryRunner } from 'typeorm';
import { ulid } from 'ulid';

/**
 * Replaces the JSONB `sections` column on `tailoring_resumes` with a proper
 * `tailoring_bullets` table, providing FK enforcement on bullet provenance.
 *
 * up:
 *   1. Create tailoring_bullets table
 *   2. Create index on resume_id
 *   3. Migrate existing JSONB section data
 *   4. Drop sections column from tailoring_resumes
 *
 * down:
 *   1. Re-add sections JSONB column
 *   2. Reconstruct JSONB from bullets
 *   3. Drop tailoring_bullets table
 */
export class AddTailoringBulletsTable1780102000000 implements MigrationInterface {
  name = 'AddTailoringBulletsTable1780102000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Create the bullets table
    await queryRunner.query(`
      CREATE TABLE "tailoring_bullets" (
        "id"            varchar(26)  NOT NULL,
        "resumeId"      varchar(26)  NOT NULL,
        "sectionTitle"  varchar(255) NOT NULL DEFAULT 'Work Experience',
        "position"      int          NOT NULL DEFAULT 0,
        "text"          text         NOT NULL DEFAULT '',
        "source"        varchar(30)  NOT NULL DEFAULT 'MATERIAL',
        "sourceId"      varchar(26)  NULL,
        "status"        varchar(30)  NOT NULL DEFAULT 'PENDING',
        "createdAt"     timestamptz  NOT NULL DEFAULT NOW(),
        "updatedAt"     timestamptz  NOT NULL DEFAULT NOW(),
        CONSTRAINT "PK_tailoring_bullets" PRIMARY KEY ("id"),
        CONSTRAINT "FK_tailoring_bullets_resume"
          FOREIGN KEY ("resumeId")
          REFERENCES "tailoring_resumes"("id")
          ON DELETE CASCADE
      )
    `);

    // 2. Index for efficient lookup by resume
    await queryRunner.query(`
      CREATE INDEX "idx_tailoring_bullets_resume_id"
        ON "tailoring_bullets" ("resumeId")
    `);

    // 3. Migrate existing JSONB data
    const rows = (await queryRunner.query(
      `SELECT id, sections FROM tailoring_resumes WHERE sections IS NOT NULL`,
    )) as Array<{ id: string; sections: unknown }>;

    for (const row of rows) {
      let sections: Array<{
        title?: string;
        bullets?: Array<{
          text?: string;
          source?: string;
          sourceId?: string | null;
          status?: string;
        }>;
      }> = [];

      try {
        sections = (
          typeof row.sections === 'string' ? JSON.parse(row.sections) : row.sections
        ) as typeof sections;
      } catch {
        // Corrupt JSONB row — skip migration for this row
        continue;
      }

      if (!Array.isArray(sections)) continue;

      for (const section of sections) {
        const sectionTitle = (section.title ?? 'Work Experience').substring(0, 255);
        const bullets = Array.isArray(section.bullets) ? section.bullets : [];

        for (let pos = 0; pos < bullets.length; pos++) {
          const b = bullets[pos];
          const bulletId = ulid();
          const text = b.text ?? '';
          const source = (b.source ?? 'MATERIAL').substring(0, 30);
          const sourceId = b.sourceId ?? null;
          const status = (b.status ?? 'PENDING').substring(0, 30);

          await queryRunner.query(
            `INSERT INTO "tailoring_bullets"
               ("id", "resumeId", "sectionTitle", "position", "text", "source", "sourceId", "status")
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [bulletId, row.id, sectionTitle, pos, text, source, sourceId, status],
          );
        }
      }
    }

    // 4. Drop the JSONB column
    await queryRunner.query(`
      ALTER TABLE "tailoring_resumes" DROP COLUMN IF EXISTS "sections"
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // 1. Re-add sections JSONB column
    await queryRunner.query(`
      ALTER TABLE "tailoring_resumes"
        ADD COLUMN IF NOT EXISTS "sections" jsonb NULL
    `);

    // 2. Reconstruct JSONB from bullets (grouped by resumeId + sectionTitle)
    const bullets = (await queryRunner.query(
      `SELECT "resumeId", "sectionTitle", "position", "id", "text", "source", "sourceId", "status"
         FROM "tailoring_bullets"
         ORDER BY "resumeId", "sectionTitle", "position"`,
    )) as Array<{
      resumeId: string;
      sectionTitle: string;
      position: number;
      id: string;
      text: string;
      source: string;
      sourceId: string | null;
      status: string;
    }>;

    // Group into nested structure keyed by resumeId
    const grouped = new Map<string, Map<string, typeof bullets>>();
    for (const b of bullets) {
      if (!grouped.has(b.resumeId)) grouped.set(b.resumeId, new Map());
      const bySection = grouped.get(b.resumeId)!;
      if (!bySection.has(b.sectionTitle)) bySection.set(b.sectionTitle, []);
      bySection.get(b.sectionTitle)!.push(b);
    }

    for (const [resumeId, bySection] of grouped) {
      const sections = Array.from(bySection.entries()).map(([title, bs]) => ({
        title,
        bullets: bs.map((b) => ({
          id: b.id,
          text: b.text,
          source: b.source,
          sourceId: b.sourceId,
          status: b.status,
        })),
      }));

      await queryRunner.query(
        `UPDATE "tailoring_resumes" SET "sections" = $1 WHERE "id" = $2`,
        [JSON.stringify(sections), resumeId],
      );
    }

    // 3. Drop the bullets table
    await queryRunner.query(`DROP TABLE IF EXISTS "tailoring_bullets"`);
  }
}
