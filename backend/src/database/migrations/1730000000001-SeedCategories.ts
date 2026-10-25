import { MigrationInterface, QueryRunner } from 'typeorm';

/** Global seed categories (user_id = NULL), available to every user. */
const SEED_CATEGORIES: ReadonlyArray<{ name: string; kind: string | null }> = [
  { name: 'Food', kind: 'expense' },
  { name: 'Transport', kind: 'expense' },
  { name: 'Housing', kind: 'expense' },
  { name: 'Utilities', kind: 'expense' },
  { name: 'Entertainment', kind: 'expense' },
  { name: 'Health', kind: 'expense' },
  { name: 'Income', kind: 'income' },
  { name: 'Other', kind: null },
];

/**
 * Inserts the global seed categories idempotently. Uses
 * `ON CONFLICT DO NOTHING` against the partial unique index
 * `uq_categories_global_name` so repeated runs never duplicate seeds and never
 * touch user-owned rows. Parameterized values prevent SQL injection.
 */
export class SeedCategories1730000000001 implements MigrationInterface {
  name = 'SeedCategories1730000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const category of SEED_CATEGORIES) {
      await queryRunner.query(
        `INSERT INTO "categories" ("user_id", "name", "kind")
         VALUES (NULL, $1, $2)
         ON CONFLICT ("name") WHERE "user_id" IS NULL DO NOTHING`,
        [category.name, category.kind],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const names = SEED_CATEGORIES.map((c) => c.name);
    await queryRunner.query(
      `DELETE FROM "categories" WHERE "user_id" IS NULL AND "name" = ANY($1)`,
      [names],
    );
  }
}
