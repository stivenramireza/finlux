# Tasks — Data Model and Persistence

Implementation plan. Backend-only, persistence layer in the NestJS app
(`backend/`). TypeORM + PostgreSQL 18.6, ESM (imports use `.js`),
`synchronize: false`, schema via versioned migrations. Minimal two-table model
(`user`, `transaction`). No HTTP controllers and no UI in this spec.

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
    `synchronize: false`, `migrationsRun: false`, and the explicit `User` /
    `Transaction` entity and `InitialSchema` migration lists. Imported once in
    `app.module.ts`.
  - _Requirements: 4.1, 4.2, 4.3, 5.2_

- [x] 4. Add the TypeORM CLI DataSource and migration scripts
  - `database/data-source.ts`: standalone `DataSource` for the TypeORM CLI,
    reading `DATABASE_URL`, `synchronize: false`, with `User` / `Transaction`
    entities and the `InitialSchema` migration.
  - pnpm scripts in `backend/package.json`: `migration:generate`,
    `migration:run`, `migration:revert`, `migration:show` (ESM-aware invocation).
  - _Requirements: 4.1, 4.2_

- [x] 5. Implement the numeric money transformer
  - `database/column-numeric.transformer.ts`: a `ColumnNumericTransformer`
    mapping `numeric(19,4)` to a decimal-safe string and back (never
    `number`/float), with unit coverage for round-trip precision.
  - _Requirements: 2.3_

- [x] 6. Define the User entity
  - `users/entities/user.entity.ts`: `id` (uuid PK), unique `email`, nullable
    `displayName`, `createdAt`/`updatedAt`, and a one-to-many relation to
    `Transaction`. This spec owns the base `user` table. (No
    `defaultCurrency`.)
  - _Requirements: 1.1, 2.4_

- [x] 7. Define the Transaction entity
  - `transactions/entities/transaction.entity.ts`: `id`, NOT NULL `userId` FK →
    User (`ON DELETE CASCADE`), `amount` (`numeric(19,4)` via the transformer),
    `type` (closed `income`|`expense` enum), `currency` (closed `COP`|`USD`
    enum), `date` (calendar day), nullable `description`, timestamps. No
    `accountId`, no `categoryId`, no soft delete.
  - _Requirements: 1.2, 1.3, 1.4, 2.1, 2.2, 2.3, 2.4_

- [x] 8. Author the initial schema migration
  - `database/migrations/1730000000000-InitialSchema.ts`: create the
    `transaction_type` and `transaction_currency` enums, the `user` table, and
    the `transaction` table with its `fk_transaction_user` FK (`ON DELETE
    CASCADE`) and the supporting index `transaction (user_id, date)`. `down`
    drops both tables and then both enums.
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 2.1, 2.2, 4.1_

- [x] 9. Implement user-scoped feature services/repositories
  - `UsersService` (identity lookups: `create`, `findById`, `findByEmail`,
    `update`) and `TransactionsService` (`create`, `findAll` with optional
    `type`/date filters, `findOne`, `update`, `remove` — physical delete). Every
    transaction method takes `userId` and applies it in the `WHERE`; no unscoped
    find-by-id. Register entities with `TypeOrmModule.forFeature` in each
    feature module.
  - _Requirements: 2.1, 3.1, 3.2_

- [x] 10. Write unit tests (Vitest)
  - Cover per-user isolation (a user cannot read/mutate another user's
    transactions via `findOne`/`findAll`/`update`/`remove`), that `currency` is
    the closed `COP`|`USD` set, and money round-trip through the numeric
    transformer without float drift.
  - _Requirements: 1.4, 2.3, 3.1, 3.2_

- [x] 11. Verify build, lint, and migrations
  - Run `pnpm --dir backend build`, `pnpm --dir backend lint`,
    `pnpm --dir backend format:check`, and `pnpm --dir backend test`; then apply
    `pnpm --dir backend migration:run` against PostgreSQL 18.6 (dev container)
    and confirm `migration:revert` rolls back cleanly, leaving only `user` and
    `transaction` (plus `migrations`).
  - _Requirements: 4.1, 4.2, 4.3, 5.1_
