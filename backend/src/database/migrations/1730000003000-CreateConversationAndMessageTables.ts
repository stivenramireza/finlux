import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Additive migration (conversational-agent-backend spec): creates the chat
 * persistence tables.
 *
 * - `message_role` enum (`user` | `agent`).
 * - `conversation` (singular): owned by one user, cascade on delete, indexed by
 *   user for listing.
 * - `message` (singular): an immutable turn in a conversation, cascade on
 *   delete, indexed by `(conversation_id, created_at)` for ordered loads.
 *
 * `down()` reverses `up()` exactly: drop indexes, then tables (message before
 * conversation for FK order), then the enum.
 */
export class CreateConversationAndMessageTables1730000003000 implements MigrationInterface {
  name = 'CreateConversationAndMessageTables1730000003000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "message_role" AS ENUM ('user', 'agent')`,
    );
    await queryRunner.query(`
      CREATE TABLE "conversation" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL,
        "title" varchar,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_conversation" PRIMARY KEY ("id"),
        CONSTRAINT "fk_conversation_user" FOREIGN KEY ("user_id")
          REFERENCES "user" ("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_conversation_user_id" ON "conversation" ("user_id")`,
    );
    await queryRunner.query(`
      CREATE TABLE "message" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "conversation_id" uuid NOT NULL,
        "role" "message_role" NOT NULL,
        "content" text NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_message" PRIMARY KEY ("id"),
        CONSTRAINT "fk_message_conversation" FOREIGN KEY ("conversation_id")
          REFERENCES "conversation" ("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_message_conversation_id_created_at" ON "message" ("conversation_id", "created_at")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "idx_message_conversation_id_created_at"`,
    );
    await queryRunner.query(`DROP TABLE "message"`);
    await queryRunner.query(`DROP INDEX "idx_conversation_user_id"`);
    await queryRunner.query(`DROP TABLE "conversation"`);
    await queryRunner.query(`DROP TYPE "message_role"`);
  }
}
