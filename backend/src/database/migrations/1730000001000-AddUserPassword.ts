import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Additive migration (user-authentication spec): adds the `password` column to
 * the existing `user` table. The column stores a bcrypt hash (never
 * plaintext); it is NOT NULL.
 *
 * This composes additively on the base `user` table and assumes no
 * pre-existing rows (the table has no production data yet), so the column is
 * added directly as NOT NULL. If existing rows ever had to be preserved, this
 * would need a nullable add + backfill + NOT NULL set instead.
 */
export class AddUserPassword1730000001000 implements MigrationInterface {
  name = 'AddUserPassword1730000001000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user" ADD COLUMN "password" varchar NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "password"`);
  }
}
