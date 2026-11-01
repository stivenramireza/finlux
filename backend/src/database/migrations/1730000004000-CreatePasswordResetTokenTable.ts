import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Additive migration (password-reset spec): creates the
 * `password_reset_tokens` table backing the forgot-password flow. Each row
 * stores only a SHA-256 hash of the raw reset token (never the raw token),
 * mirroring the `sessions` table. The token is single-use (`used_at`) and
 * time-limited (`expires_at`). The FK to `users` cascades on delete; a unique
 * constraint on `token_hash` enables lookup by hash, and an index supports
 * lookups/supersede by user.
 */
export class CreatePasswordResetTokenTable1730000004000 implements MigrationInterface {
  name = 'CreatePasswordResetTokenTable1730000004000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "password_reset_tokens" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL,
        "token_hash" varchar NOT NULL,
        "expires_at" timestamptz NOT NULL,
        "used_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_password_reset_tokens" PRIMARY KEY ("id"),
        CONSTRAINT "uq_password_reset_tokens_token_hash" UNIQUE ("token_hash"),
        CONSTRAINT "fk_password_reset_tokens_user" FOREIGN KEY ("user_id")
          REFERENCES "users" ("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_password_reset_tokens_user_id" ON "password_reset_tokens" ("user_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "idx_password_reset_tokens_user_id"`);
    await queryRunner.query(`DROP TABLE "password_reset_tokens"`);
  }
}
