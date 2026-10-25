# Design — Data Model and Persistence

## Goal
Implement Finlux's core data layer — `User`, `Account`, `Transaction`, and
`Category` — in PostgreSQL via TypeORM inside the NestJS backend. This spec
covers only persistence: entities, relationships, migrations, and user-scoped
repositories. No UI, no authentication/credentials, and no natural-language
parsing (those belong to the `user-authentication` and
`natural-language-transaction-capture` specs).

## Tech context
- **Runtime/framework**: NestJS on Node.js 24.22.1, ESM (`"type": "module"`),
  TypeScript. All intra-project imports use explicit `.js` extensions
  (e.g. `import { UsersService } from './users.service.js';`), matching the
  existing `app.module.ts` style.
- **Database**: PostgreSQL 18.6.
- **ORM**: TypeORM, with `@nestjs/typeorm` for Nest integration.
- **Config**: `@nestjs/config` (`ConfigModule`) reads `DATABASE_URL` from the
  environment (already documented in `backend/.env.example`). Nothing is
  hard-coded and no secrets are committed.
- **Schema management**: `synchronize: false` **in all environments**; the
  schema is created and evolved exclusively through versioned migrations.

New runtime dependencies to add (pinned when implemented): `@nestjs/typeorm`,
`typeorm`, `pg`, `@nestjs/config`.

## Entities (data model)
All entities use a `uuid` primary key (`gen_random_uuid()` / TypeORM
`@PrimaryGeneratedColumn('uuid')`) and carry `createdAt` / `updatedAt`
timestamps (`timestamptz`) via `@CreateDateColumn` / `@UpdateDateColumn`
(Requirement 2.4). Table names are `snake_case` plural (`users`, `accounts`,
`categories`, `transactions`).

### User (`users`)
Anchors and isolates all financial data. Credentials/sessions are owned by the
`user-authentication` spec; here the `User` is only an identity + ownership
anchor.

| Field | Type | Notes |
|-------|------|-------|
| `id` | `uuid` PK | generated |
| `email` | `varchar`, **unique**, not null | login identifier / contact |
| `displayName` | `varchar`, nullable | optional friendly name |
| `defaultCurrency` | `char(3)`, not null | ISO 4217 (e.g. `"COP"`) |
| `createdAt` | `timestamptz` | `@CreateDateColumn` |
| `updatedAt` | `timestamptz` | `@UpdateDateColumn` |

Relations: one-to-many to `Account`, `Transaction`, and (owned) `Category`.

### Account (`accounts`)
A user-named financial account/wallet (e.g. "cash", "payroll").

| Field | Type | Notes |
|-------|------|-------|
| `id` | `uuid` PK | generated |
| `userId` | `uuid` FK → `users.id`, **not null** | owner (Req 2.1) |
| `name` | `varchar`, not null | user-provided label |
| `type` | `varchar`, nullable | optional free/typed classifier (e.g. cash, bank) |
| `currency` | `char(3)`, nullable | ISO 4217; falls back to `User.defaultCurrency` |
| `createdAt` | `timestamptz` | |
| `updatedAt` | `timestamptz` | |

Constraints: **unique `(userId, name)`** — names are unique per user, not
globally. Relations: many-to-one `User`; one-to-many `Transaction`.

### Category (`categories`)
Classifies transactions. May be a **system seed category** (shared, `userId`
null) or a **user-owned category** (`userId` set).

| Field | Type | Notes |
|-------|------|-------|
| `id` | `uuid` PK | generated |
| `userId` | `uuid` FK → `users.id`, **nullable** | `null` = system/global seed; non-null = user-owned |
| `name` | `varchar`, not null | e.g. "Food" |
| `kind` | `varchar`, nullable | optional (e.g. `income` / `expense` hint) |
| `icon` | `varchar`, nullable | optional UI hint |
| `createdAt` | `timestamptz` | |
| `updatedAt` | `timestamptz` | |

Constraints: **unique `(userId, name)`**, treating `null` as global. Because
Postgres `UNIQUE` treats `NULL` as distinct, uniqueness of global categories is
enforced with a **partial unique index** on `(name) WHERE user_id IS NULL`, plus
a regular unique index on `(user_id, name) WHERE user_id IS NOT NULL` for
user-owned ones. This guarantees one global "Food" and one "Food" per user.
Relations: many-to-one (nullable) `User`; one-to-many `Transaction`.

### Transaction (`transactions`)
A single recorded income or expense.

| Field | Type | Notes |
|-------|------|-------|
| `id` | `uuid` PK | generated |
| `userId` | `uuid` FK → `users.id`, **not null** | owner (Req 2.1) |
| `accountId` | `uuid` FK → `accounts.id`, **not null** | associated account (Req 1.3) |
| `categoryId` | `uuid` FK → `categories.id`, **nullable** | optional category (Req 1.3) |
| `amount` | `numeric(19,4)` | precise decimal (see Money representation) |
| `currency` | `char(3)`, not null | ISO 4217 |
| `type` | enum `income` \| `expense`, not null | closed enum |
| `date` | `date`, not null | calendar day the money moved (no time-of-day; MVP decision) |
| `description` | `varchar`/`text`, nullable | user text |
| `createdAt` | `timestamptz` | |
| `updatedAt` | `timestamptz` | |
| `deletedAt` | `timestamptz`, **nullable** | **soft delete** (`@DeleteDateColumn`) |

`type` is implemented as a Postgres enum type (`transaction_type`) or a
`varchar` with a `CHECK` constraint; the enum approach is preferred for a closed
domain.

## Money representation
- `amount` is stored as Postgres **`numeric(19,4)`** — a fixed-precision decimal
  with 4 fractional digits, enough for ISO 4217 minor units plus sub-unit
  precision, and 15 integer digits of headroom.
- TypeORM returns `numeric` columns as JavaScript `string` by default. The
  column uses a **`ColumnNumericTransformer`** that maps the DB value to a
  safe decimal representation in the domain layer (a decimal string, or a
  `decimal.js` / `big.js` instance if a decimal library is adopted) and back to
  a string on write.
- Rationale (Requirement 2.3): JavaScript `number` is IEEE-754 binary floating
  point and cannot represent many decimal fractions exactly (e.g. `0.1 + 0.2`),
  which corrupts monetary math. We therefore **never** map money to `float`/
  `number`; all arithmetic happens on the decimal type and the column stays
  `numeric`.

## Currency
- Each `Transaction` stores its own `currency` (ISO 4217, `char(3)`).
  `User.defaultCurrency` provides the default used when a transaction (or
  account) does not specify one; `Account.currency` may also override at account
  level.
- **No multi-currency conversion** is in scope for this spec: currencies are
  stored and returned as recorded. FX/normalization (if ever needed) is a future
  spec and must not be assumed here.

## Relationships & integrity
- `Account.userId` and `Transaction.userId` are **NOT NULL** FKs to `users` —
  every account and transaction belongs to exactly one user (Req 2.1).
- `Transaction.accountId` is a NOT NULL FK; `Transaction.categoryId` is a
  nullable FK (Req 1.3, 2.2). Referential integrity is enforced by the DB.
- `onDelete` policy:
  - `Account.user` → `ON DELETE CASCADE` (deleting a user removes their
    accounts). `Transaction.user` → `CASCADE`.
  - `Transaction.account` → `ON DELETE RESTRICT` (an account with transactions
    cannot be hard-deleted out from under them; deletion is a higher-level
    decision).
  - `Transaction.category` → `ON DELETE SET NULL` (categories can disappear
    without destroying transactions; the category simply becomes unset).
  - `Category.user` → `ON DELETE CASCADE` for user-owned categories (global
    seed rows have `userId` null and are unaffected).
- Timestamps `createdAt` / `updatedAt` on every entity for auditability
  (Req 2.4); `Transaction` additionally carries `deletedAt` for soft delete.

## Per-user isolation (Requirement 3)
Isolation is enforced in the repository/service layer: **every** data-access
method takes a `userId` and applies it in the `WHERE` clause. There is no
"find by id" that is not also scoped by `userId`, so one user can never read or
mutate another user's row (Req 3.1, 3.2).

Per entity we expose a feature service wrapping an injected TypeORM repository:

- **UsersService** — `create(dto)`, `findById(id)`, `findByEmail(email)`,
  `update(id, dto)`. (The `User` is the isolation anchor; its own lookups are by
  identity.)
- **AccountsService** — all methods user-scoped:
  - `create(userId, dto)`
  - `findAll(userId)`
  - `findOne(userId, accountId)` → `WHERE id = :accountId AND userId = :userId`
  - `update(userId, accountId, dto)`
  - `remove(userId, accountId)` (guarded against accounts with transactions)
- **CategoriesService** — user-scoped reads return **the union of the user's own
  categories and global seed categories** (`WHERE userId = :userId OR userId IS
  NULL`); writes only ever target the caller's own rows:
  - `create(userId, dto)`, `findAllForUser(userId)`,
    `findOne(userId, categoryId)`, `update(userId, categoryId, dto)`,
    `remove(userId, categoryId)` (cannot touch global rows).
- **TransactionsService** — all methods user-scoped, soft-delete aware:
  - `create(userId, dto)` (validates `accountId`/`categoryId` belong to the same
    user)
  - `findAll(userId, filter?)` (date/account/category filters, all AND-ed with
    `userId`, excludes soft-deleted rows)
  - `findOne(userId, transactionId)`
  - `update(userId, transactionId, dto)`
  - `softDelete(userId, transactionId)` (sets `deletedAt`)

TypeORM's global query behavior excludes soft-deleted rows (`deletedAt`) by
default. **Note:** PostgreSQL **Row-Level Security (RLS)** is a possible future
defense-in-depth reinforcement of this application-level scoping, but it is
**out of scope** here.

## Migrations (Requirement 4)
- A TypeORM **`DataSource`** (`backend/src/database/data-source.ts`) is defined
  for the CLI, reading `DATABASE_URL` from the environment, with
  `synchronize: false` and `migrations` pointing at the migrations directory.
- Migrations live in **`backend/src/database/migrations/`**, named
  `<timestamp>-<PascalCaseName>.ts` so execution order follows the timestamp
  prefix (e.g. `1730000000000-InitialSchema.ts`).
- The **initial migration** creates all four tables with their columns, the
  `transaction_type` enum, FKs with the `onDelete` policies above, and:
  - unique index `accounts (user_id, name)`;
  - partial unique index `categories (name) WHERE user_id IS NULL` and unique
    index `categories (user_id, name) WHERE user_id IS NOT NULL`;
  - supporting indexes: `transactions (user_id, date)`,
    `transactions (user_id, account_id)`, `transactions (user_id, category_id)`,
    and `accounts (user_id)`.
- A follow-up (or appended) migration/seeder inserts the global seed categories
  (see Seed data).
- pnpm scripts (added to `backend/package.json`), run via the TypeORM CLI
  against the compiled DataSource:
  - `migration:generate` — generate a migration from entity diffs
  - `migration:run` — apply pending migrations
  - `migration:revert` — roll back the last migration
  - `migration:show` — list applied/pending

  (Exact invocation uses `typeorm-ts-node-esm` or a built DataSource; because
  the project is ESM, the CLI is run with the ESM-aware loader.)

## Module structure (NestJS)
Proposed files under `backend/src/` (all imports use `.js` extensions):

```
backend/src/
├── app.module.ts                      # imports DatabaseModule + feature modules
├── database/
│   ├── database.module.ts             # TypeOrmModule.forRootAsync + ConfigService
│   ├── data-source.ts                 # standalone DataSource for the TypeORM CLI
│   ├── column-numeric.transformer.ts  # numeric(19,4) <-> decimal transformer
│   └── migrations/
│       └── 1730000000000-InitialSchema.ts
├── users/
│   ├── users.module.ts
│   ├── users.service.ts
│   ├── entities/user.entity.ts
│   └── dto/ (create-user.dto.ts, update-user.dto.ts)
├── accounts/
│   ├── accounts.module.ts
│   ├── accounts.service.ts
│   ├── entities/account.entity.ts
│   └── dto/
├── categories/
│   ├── categories.module.ts
│   ├── categories.service.ts
│   ├── entities/category.entity.ts
│   └── dto/
└── transactions/
    ├── transactions.module.ts
    ├── transactions.service.ts
    ├── entities/transaction.entity.ts
    └── dto/
```

- **`DatabaseModule`** uses `TypeOrmModule.forRootAsync({ imports:
  [ConfigModule], inject: [ConfigService], useFactory })`, building options from
  `DATABASE_URL` with `synchronize: false`, `migrationsRun: false`, and the
  entity/migration globs. It is imported once in `AppModule`.
- Each feature module registers its entity with
  `TypeOrmModule.forFeature([Entity])`, declares its service as a provider, and
  exports the service for other modules (e.g. `TransactionsModule` may import
  `AccountsModule`/`CategoriesModule` for ownership validation).
- `ConfigModule.forRoot({ isGlobal: true })` is registered in `AppModule`.

No controllers are defined in this spec (persistence only); HTTP endpoints are
added by later feature specs.

## Seed data
System seed categories are global rows with `userId = NULL`, available to every
user read. Initial set:

`Food`, `Transport`, `Housing`, `Utilities`, `Entertainment`, `Health`,
`Income`, `Other`.

Insertion is **idempotent**: performed in a dedicated seed migration that
`INSERT ... ON CONFLICT DO NOTHING` against the global partial unique index on
`(name) WHERE user_id IS NULL`. Running migrations repeatedly never duplicates
seeds and never touches user-owned categories. (An optional Nest seeder command
could re-run the same idempotent logic outside migrations, but the migration is
the source of truth.)

## Security baseline (Requirement 5)
- All stored financial data is treated as **sensitive PII**; services avoid
  logging row contents and never log connection strings or secrets.
- `DATABASE_URL` is read from the environment via `ConfigService`, **referenced
  by key name only**, never hard-coded and never committed. `.env` stays
  git-ignored; `backend/.env.example` documents the key.
- All access goes through **TypeORM**, which uses parameterized queries
  (Req 4.2); any raw query uses bound parameters, never string interpolation of
  user input.

## Verification
- `pnpm --dir backend build` compiles the backend with the new modules/entities.
- `pnpm --dir backend lint` and `pnpm --dir backend format:check` pass.
- Unit tests (Vitest) cover user-scoped service behavior — in particular that
  `findOne`/`update`/`softDelete` never return or mutate another user's rows,
  and that the numeric transformer round-trips money without float drift.
- When implemented, `pnpm --dir backend migration:run` applies the initial
  schema + seed migration cleanly against **PostgreSQL 18.6**, and
  `migration:revert` rolls it back.

## Resolved decisions
These were previously open; they are now settled (approved by the user):
- **`users` table ownership.** This spec (`data-model-and-persistence`) creates
  the base `users` table (`id`, unique `email`, `displayName`,
  `defaultCurrency`, timestamps). The `user-authentication` spec adds credential
  columns (e.g. password hash) via its own later migration on the same table,
  composing additively on top of this base. There is no duplicate `users` entity.
- **`Transaction.date` type.** Modeled as SQL `date` (calendar day, no
  time-of-day) for the MVP — natural for natural-language capture ("I spent 20
  yesterday"). Upgrading to `timestamptz` is a future change if ordering/insight
  precision ever requires it.
- **Account deletion with existing transactions.** `Transaction.account` keeps
  `onDelete: RESTRICT`: an account with transactions cannot be hard-deleted.
  Account archival / soft-delete (symmetric with transactions) is deferred to a
  future account-management spec.
