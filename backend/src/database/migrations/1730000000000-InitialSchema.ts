import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates the simplified Finlux schema: the `user` and `transaction` tables,
 * the `transaction_type` enum (income/expense), the `transaction_currency`
 * enum (COP/USD), the `transaction → user` foreign key (ON DELETE CASCADE),
 * and the supporting index on `transaction (user_id, date)`.
 *
 * All statements use `gen_random_uuid()` (built into PostgreSQL 13+), so no
 * extension needs to be enabled.
 */
export class InitialSchema1730000000000 implements MigrationInterface {
  name = 'InitialSchema1730000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // --- enums ---
    await queryRunner.query(
      `CREATE TYPE "transaction_type" AS ENUM ('income', 'expense')`,
    );
    await queryRunner.query(
      `CREATE TYPE "transaction_currency" AS ENUM ('COP', 'USD')`,
    );

    // --- user ---
    await queryRunner.query(`
      CREATE TABLE "user" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "email" varchar NOT NULL,
        "display_name" varchar,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_user" PRIMARY KEY ("id"),
        CONSTRAINT "uq_user_email" UNIQUE ("email")
      )
    `);

    // --- transaction ---
    await queryRunner.query(`
      CREATE TABLE "transaction" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL,
        "amount" numeric(19,4) NOT NULL,
        "type" "transaction_type" NOT NULL,
        "currency" "transaction_currency" NOT NULL,
        "date" date NOT NULL,
        "description" varchar,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_transaction" PRIMARY KEY ("id"),
        CONSTRAINT "fk_transaction_user" FOREIGN KEY ("user_id")
          REFERENCES "user" ("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_transaction_user_id_date" ON "transaction" ("user_id", "date")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "transaction"`);
    await queryRunner.query(`DROP TABLE "user"`);
    await queryRunner.query(`DROP TYPE "transaction_currency"`);
    await queryRunner.query(`DROP TYPE "transaction_type"`);
  }
}
