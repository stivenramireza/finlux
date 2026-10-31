import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Additive migration (conversational-agent-backend spec): creates the chat
 * persistence tables.
 *
 * - `message_role` enum (`user` | `agent`).
 * - `conversations`: owned by one user, cascade on delete, indexed by
 *   user for listing.
 * - `messages`: an immutable turn in a conversation, cascade on
 *   delete, indexed by `(conversation_id, created_at)` for ordered loads.
 *
 * `down()` reverses `up()` exactly: drop indexes, then tables (messages before
 * conversations for FK order), then the enum.
 */
export class CreateConversationAndMessageTables1730000003000 implements MigrationInterface {
  name = 'CreateConversationAndMessageTables1730000003000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "message_role" AS ENUM ('user', 'agent')`,
    );
    await queryRunner.query(`
      CREATE TABLE "conversations" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL,
        "title" varchar,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_conversations" PRIMARY KEY ("id"),
        CONSTRAINT "fk_conversations_user" FOREIGN KEY ("user_id")
          REFERENCES "users" ("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_conversations_user_id" ON "conversations" ("user_id")`,
    );
    await queryRunner.query(`
      CREATE TABLE "messages" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "conversation_id" uuid NOT NULL,
        "role" "message_role" NOT NULL,
        "content" text NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_messages" PRIMARY KEY ("id"),
        CONSTRAINT "fk_messages_conversation" FOREIGN KEY ("conversation_id")
          REFERENCES "conversations" ("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_messages_conversation_id_created_at" ON "messages" ("conversation_id", "created_at")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "idx_messages_conversation_id_created_at"`,
    );
    await queryRunner.query(`DROP TABLE "messages"`);
    await queryRunner.query(`DROP INDEX "idx_conversations_user_id"`);
    await queryRunner.query(`DROP TABLE "conversations"`);
    await queryRunner.query(`DROP TYPE "message_role"`);
  }
}
