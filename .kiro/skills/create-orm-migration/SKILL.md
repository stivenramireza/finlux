---
name: create-orm-migration
description: Author, register, and verify a TypeORM database migration in the Finlux NestJS backend. Use whenever adding or changing database schema (new table, column, index, constraint, enum) in backend/src/database/migrations, or when asked to create/run/revert a migration.
metadata:
  app: "@finlux/backend"
  stack: "NestJS + TypeORM + PostgreSQL 18.6 (ESM)"
---

# Create a TypeORM migration (Finlux backend)

The Finlux backend manages all schema changes through **versioned, hand-written
migrations**. `synchronize` is always `false`; never rely on auto-sync. This
skill captures the project conventions that are easy to get wrong.

All commands run from `backend/` using **pnpm** (never npm/yarn). The package
manager and Node version are pinned in `backend/package.json`.

## Non-negotiable conventions

- **ESM imports use `.js` extensions.** The backend is `"type": "module"`.
  Every intra-project import (entities, migrations) must end in `.js`, even
  though the source is `.ts` (e.g. `import { User } from '../users/entities/user.entity.js'`).
- **Table names are `snake_case` singular:** `user`, `transaction`, `session`.
  Never plural.
- **Named constraints and indexes**, following these prefixes:
  - Primary key: `pk_<table>` (e.g. `pk_user`)
  - Unique: `uq_<table>_<col>` (e.g. `uq_user_email`)
  - Foreign key: `fk_<table>_<ref>` (e.g. `fk_transaction_user`)
  - Index: `idx_<table>_<cols>` (e.g. `idx_transaction_user_id_date`)
- **Column names are `snake_case`** in SQL (`user_id`, `created_at`); entities
  map them with `name:` where the TS property is camelCase.
- **Enums** are real Postgres enum types with an explicit `enumName`
  (e.g. `transaction_type`, `transaction_currency`).
- **UUID PKs** default to `gen_random_uuid()` (built into PostgreSQL 13+); no
  extension needed.
- **No `SET search_path` and no `CREATE SCHEMA`.** Everything lives in the
  default `public` schema of the `finlux` database. Do not reintroduce a
  dedicated schema.
- Every migration must have a working `down()` that cleanly reverses `up()`
  (drop in reverse dependency order: indexes/FKs, then tables, then enums/types).

## Procedure

### 1. Write the migration file
Create `backend/src/database/migrations/<timestamp>-<PascalCaseName>.ts`. The
numeric `<timestamp>` prefix sets execution order — use a value strictly greater
than the latest existing migration. Pattern:

```ts
import { MigrationInterface, QueryRunner } from 'typeorm';

export class <PascalCaseName><timestamp> implements MigrationInterface {
  name = '<PascalCaseName><timestamp>';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`/* forward DDL, singular table + named constraints */`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`/* exact reverse of up() */`);
  }
}
```

Prefer additive, reversible changes. If a column must become NOT NULL on a table
that could hold rows, do nullable-add → backfill → set NOT NULL instead of a
direct NOT NULL add.

### 2. Register the migration in BOTH places
TypeORM resolves migrations from explicit import arrays (not globs) for
deterministic ESM resolution. Add the class to the `migrations: [...]` array in
**both**:
- `backend/src/database/data-source.ts` (standalone CLI DataSource), and
- `backend/src/database/database.module.ts` (Nest `TypeOrmModule.forRootAsync`).

Keep both arrays identical and in timestamp order. Import with the `.js`
extension. If you forget one file, the migration silently won't run in that
context.

### 3. If you added/changed a table, update the entity too
Entity files live under `backend/src/<feature>/entities/*.entity.ts`. Keep the
`@Entity({ name: '<singular>' })`, column `name:` mappings, relations, and
`@Index(...)` consistent with the migration. Register new entities in the
`entities: [...]` arrays in both `data-source.ts` and `database.module.ts`.

### 4. Verify (required before declaring done)
Run from `backend/`:

```bash
pnpm build            # compiles; catches ESM/import mistakes
pnpm lint
pnpm format:check
pnpm migration:run    # applies pending migrations
pnpm migration:show   # confirm [X] on the new migration
```

Then prove the `down()` works by round-tripping:

```bash
pnpm migration:revert # rolls back exactly one migration
pnpm migration:show   # confirm it is now pending
pnpm migration:run    # re-apply, leaving the DB in the final state
```

The migration scripts run `pnpm build` first, then the TypeORM CLI against the
compiled `dist/database/data-source.js`.

### 5. Inspect the database (optional)
PostgreSQL runs in a Docker container named `postgres`. `psql` is not on the
host PATH — exec into the container. The dev database is `finlux`:

```bash
docker exec postgres psql -U postgres -d finlux -c '\dt public.*'
```

## Reference: available pnpm scripts
- `migration:generate` — generate from entity diffs (review output; it may not
  match the project's naming conventions — hand-edit as needed).
- `migration:run` — apply pending migrations.
- `migration:revert` — roll back the last migration.
- `migration:show` — list applied (`[X]`) / pending (`[ ]`).

## Guardrails
- `backend/.env` holds `DATABASE_URL` and is git-ignored; reference it by key
  name, never echo its value, never commit it.
- Recreating the schema (`DROP SCHEMA public CASCADE`) is destructive — only do
  it on the local dev database, and confirm with the user first.
