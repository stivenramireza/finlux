import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Additive migration (password-history spec): creates the `password_history`
 * table backing the no-reuse rule. Each row stores only a bcrypt hash of a
 * past password (never plaintext), the owning user, and a creation timestamp;
 * rows are immutable (no `updated_at`). The FK to `users` cascades on delete.
 * The composite index on `(user_id, created_at)` serves both the N-most-recent
 * read (`ORDER BY created_at DESC LIMIT N`) and the delete-on-insert prune.
 */
export class CreatePasswordHistoryTable1730000005000 implements MigrationInterface {
  name = 'CreatePasswordHistoryTable1730000005000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "password_history" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL,
        "password_hash" varchar NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_password_history" PRIMARY KEY ("id"),
        CONSTRAINT "fk_password_history_user" FOREIGN KEY ("user_id")
          REFERENCES "users" ("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_password_history_user_id_created_at" ON "password_history" ("user_id", "created_at")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "idx_password_history_user_id_created_at"`,
    );
    await queryRunner.query(`DROP TABLE "password_history"`);
  }
}
