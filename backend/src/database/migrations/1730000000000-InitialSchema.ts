import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates the core Finlux schema: users, accounts, categories, transactions,
 * the `transaction_type` enum, foreign keys with their onDelete policies, and
 * the unique / supporting indexes described in the design.
 *
 * All statements use `gen_random_uuid()` (built into PostgreSQL 13+), so no
 * extension needs to be enabled.
 */
export class InitialSchema1730000000000 implements MigrationInterface {
  name = 'InitialSchema1730000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // --- enum: transaction_type ---
    await queryRunner.query(
      `CREATE TYPE "transaction_type" AS ENUM ('income', 'expense')`,
    );

    // --- users ---
    await queryRunner.query(`
      CREATE TABLE "users" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "email" varchar NOT NULL,
        "display_name" varchar,
        "default_currency" char(3) NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_users" PRIMARY KEY ("id"),
        CONSTRAINT "uq_users_email" UNIQUE ("email")
      )
    `);

    // --- accounts ---
    await queryRunner.query(`
      CREATE TABLE "accounts" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL,
        "name" varchar NOT NULL,
        "type" varchar,
        "currency" char(3),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_accounts" PRIMARY KEY ("id"),
        CONSTRAINT "fk_accounts_user" FOREIGN KEY ("user_id")
          REFERENCES "users" ("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_accounts_user_id_name" ON "accounts" ("user_id", "name")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_accounts_user_id" ON "accounts" ("user_id")`,
    );

    // --- categories ---
    await queryRunner.query(`
      CREATE TABLE "categories" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "user_id" uuid,
        "name" varchar NOT NULL,
        "kind" varchar,
        "icon" varchar,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_categories" PRIMARY KEY ("id"),
        CONSTRAINT "fk_categories_user" FOREIGN KEY ("user_id")
          REFERENCES "users" ("id") ON DELETE CASCADE
      )
    `);
    // Exactly one global category per name (user_id IS NULL).
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_categories_global_name" ON "categories" ("name") WHERE "user_id" IS NULL`,
    );
    // Exactly one name per user for user-owned categories.
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_categories_user_id_name" ON "categories" ("user_id", "name") WHERE "user_id" IS NOT NULL`,
    );

    // --- transactions ---
    await queryRunner.query(`
      CREATE TABLE "transactions" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL,
        "account_id" uuid NOT NULL,
        "category_id" uuid,
        "amount" numeric(19,4) NOT NULL,
        "currency" char(3) NOT NULL,
        "type" "transaction_type" NOT NULL,
        "date" date NOT NULL,
        "description" varchar,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        CONSTRAINT "pk_transactions" PRIMARY KEY ("id"),
        CONSTRAINT "fk_transactions_user" FOREIGN KEY ("user_id")
          REFERENCES "users" ("id") ON DELETE CASCADE,
        CONSTRAINT "fk_transactions_account" FOREIGN KEY ("account_id")
          REFERENCES "accounts" ("id") ON DELETE RESTRICT,
        CONSTRAINT "fk_transactions_category" FOREIGN KEY ("category_id")
          REFERENCES "categories" ("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_transactions_user_id_date" ON "transactions" ("user_id", "date")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_transactions_user_id_account_id" ON "transactions" ("user_id", "account_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_transactions_user_id_category_id" ON "transactions" ("user_id", "category_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "transactions"`);
    await queryRunner.query(`DROP TABLE "categories"`);
    await queryRunner.query(`DROP TABLE "accounts"`);
    await queryRunner.query(`DROP TABLE "users"`);
    await queryRunner.query(`DROP TYPE "transaction_type"`);
  }
}
