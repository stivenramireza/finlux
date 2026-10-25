# Tasks — Data Model and Persistence

Implementation plan. Backend-only, persistence layer in the NestJS app
(`backend/`). TypeORM + PostgreSQL 18.6, ESM (imports use `.js`),
`synchronize: false`, schema via versioned migrations. No HTTP controllers and
no UI in this spec.

- [x] 1. Add and pin persistence dependencies
  - Add `@nestjs/typeorm`, `typeorm`, `pg`, and `@nestjs/config` to
    `backend/package.json` with exact pinned versions, installed via pnpm under
    Node 24.22.1.
  - _Requirements: 4.2, 4.3_

- [x] 2. Register global configuration
  - Add `ConfigModule.forRoot({ isGlobal: true })` in `app.module.ts` so
    `DATABASE_URL` is read from the environment via `ConfigService` (never
    hard-coded).
  - _Requirements: 4.3, 5.2_

- [x] 3. Create the DatabaseModule
  - `database/database.module.ts`: `TypeOrmModule.forRootAsync` with
    `ConfigModule`/`ConfigService`, building options from `DATABASE_URL`,
    `synchronize: false`, `migrationsRun: false`, and entity/migration globs.
    Import it once in `app.module.ts`.
  - _Requirements: 4.1, 4.2, 4.3, 5.2_

- [x] 4. Add the TypeORM CLI DataSource and migration scripts
  - `database/data-source.ts`: standalone `DataSource` for the TypeORM CLI,
    reading `DATABASE_URL`, `synchronize: false`, migrations directory set.
  - Add pnpm scripts to `backend/package.json`: `migration:generate`,
    `migration:run`, `migration:revert`, `migration:show` (ESM-aware invocation).
  - _Requirements: 4.1, 4.2_

- [x] 5. Implement the numeric money transformer
  - `database/column-numeric.transformer.ts`: a `ColumnNumericTransformer`
    mapping `numeric(19,4)` to a decimal-safe representation and back (never
    `number`/float), with unit coverage for round-trip precision.
  - _Requirements: 2.3_

- [x] 6. Define the User entity
  - `users/entities/user.entity.ts`: `id` (uuid PK), unique `email`,
    nullable `displayName`, `defaultCurrency` (`char(3)`, ISO 4217),
    `createdAt`/`updatedAt`. This spec owns the base `users` table.
  - _Requirements: 1.1, 2.4_

- [x] 7. Define the Account entity
  - `accounts/entities/account.entity.ts`: `id`, NOT NULL `userId` FK → User,
    `name`, optional `type`/`currency`, timestamps; unique `(userId, name)`.
  - _Requirements: 1.2, 2.1, 2.2, 2.4_

- [x] 8. Define the Category entity
  - `categories/entities/category.entity.ts`: `id`, **nullable** `userId` FK
    (null = system seed, non-null = user-owned), `name`, optional `kind`/`icon`,
    timestamps. Uniqueness handled by partial unique indexes in the migration.
  - _Requirements: 1.4, 2.4_

- [x] 9. Define the Transaction entity
  - `transactions/entities/transaction.entity.ts`: `id`, NOT NULL `userId` and
    `accountId` FKs, nullable `categoryId` FK, `amount` (`numeric(19,4)` via the
    transformer), `currency`, `type` (closed `income`|`expense` enum), `date`
    (calendar day), nullable `description`, timestamps, and `deletedAt`
    (`@DeleteDateColumn`, soft delete).
  - _Requirements: 1.3, 2.2, 2.3, 2.4_

- [x] 10. Author the initial schema migration
  - `database/migrations/<timestamp>-InitialSchema.ts`: create `users`,
    `accounts`, `categories`, `transactions`; the `transaction_type` enum; FKs
    with onDelete policies (account/transaction → user CASCADE, transaction →
    account RESTRICT, transaction → category SET NULL, category → user CASCADE);
    unique index `accounts (user_id, name)`; partial unique indexes on
    `categories` for global vs user-owned names; supporting indexes on
    `transactions (user_id, date)`, `(user_id, account_id)`,
    `(user_id, category_id)`, and `accounts (user_id)`.
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 2.1, 2.2, 4.1_

- [x] 11. Author the idempotent seed-categories migration
  - A migration inserting the global seed categories (Food, Transport, Housing,
    Utilities, Entertainment, Health, Income, Other) with `userId = NULL` using
    `INSERT ... ON CONFLICT DO NOTHING`, so repeated runs never duplicate seeds
    or touch user-owned rows.
  - _Requirements: 1.4, 4.1_

- [x] 12. Implement user-scoped feature services/repositories
  - `UsersService` (identity lookups), `AccountsService`, `CategoriesService`
    (reads return user rows ∪ global seeds; writes only the caller's rows),
    `TransactionsService` (soft-delete aware, validates account/category belong
    to the same user). Every financial-data method takes `userId` and applies it
    in the `WHERE`; no unscoped find-by-id. Register entities with
    `TypeOrmModule.forFeature` in each feature module.
  - _Requirements: 2.1, 2.2, 3.1, 3.2_

- [x] 13. Write unit tests (Vitest)
  - Cover per-user isolation (a user cannot read/mutate another user's accounts,
    transactions, or categories via `findOne`/`update`/`softDelete`), the
    global-vs-user category read behavior, and money round-trip through the
    numeric transformer without float drift.
  - _Requirements: 2.3, 3.1, 3.2_

- [x] 14. Verify build, lint, and migrations
  - Run `pnpm --dir backend build`, `pnpm --dir backend lint`, and
    `pnpm --dir backend test`; then apply `pnpm --dir backend migration:run`
    against PostgreSQL 18.6 and confirm `migration:revert` rolls back cleanly.
  - _Requirements: 4.1, 4.2, 4.3, 5.1_
