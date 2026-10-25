import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Additive migration (user-authentication spec): creates the singular,
 * audit-only `session` table. It records who logged in and when the issued
 * token expires. `token` holds a SHA-256 hash of the JWT (never the raw token).
 * The FK to `users` cascades on delete; an index supports lookups by user.
 */
export class CreateSessionTable1730000002000 implements MigrationInterface {
  name = 'CreateSessionTable1730000002000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "session" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL,
        "token" varchar NOT NULL,
        "expires_at" timestamptz NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_session" PRIMARY KEY ("id"),
        CONSTRAINT "fk_session_user" FOREIGN KEY ("user_id")
          REFERENCES "users" ("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_session_user_id" ON "session" ("user_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "idx_session_user_id"`);
    await queryRunner.query(`DROP TABLE "session"`);
  }
}
