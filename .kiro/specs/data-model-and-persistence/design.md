# Design — Data Model and Persistence

## Goal
Implement Finlux's core data layer — `User` and `Transaction` — in PostgreSQL
via TypeORM inside the NestJS backend. The model is deliberately minimal: two
tables only. This spec covers only persistence: entities, relationships,
migrations, and user-scoped repositories. No UI, no authentication/credentials,
and no natural-language parsing (those belong to the `user-authentication` and
`natural-language-transaction-capture` specs).

## Tech context
- **Runtime/framework**: NestJS on Node.js 24.22.1, ESM (`"type": "module"`),
  TypeScript. All intra-project imports use explicit `.js` extensions
  (e.g. `import { UsersService } from './users.service.js';`), matching the
  existing `app.module.ts` style.
- **Database**: PostgreSQL 18.6. (The local dev container runs an 18.x image;
  that is only the dev environment — the pinned target stays 18.6.)
- **ORM**: TypeORM, with `@nestjs/typeorm` for Nest integration.
- **Config**: `@nestjs/config` (`ConfigModule`) reads `DATABASE_URL` from the
  environment (already documented in `backend/.env.example`). Nothing is
  hard-coded and no secrets are committed.
- **Schema management**: `synchronize: false` **in all environments**; the
  schema is created and evolved exclusively through versioned migrations.

Runtime dependencies (pinned): `@nestjs/typeorm`, `typeorm`, `pg`,
`@nestjs/config`.

## Entities (data model)
All entities use a `uuid` primary key (`gen_random_uuid()` / TypeORM
`@PrimaryGeneratedColumn('uuid')`) and carry `createdAt` / `updatedAt`
timestamps (`timestamptz`) via `@CreateDateColumn` / `@UpdateDateColumn`
(Requirement 2.4). Table names are `snake_case` plural (`users`,
`transactions`).

### User (`users`)
Anchors and isolates all financial data. Credentials/sessions are owned by the
`user-authentication` spec; here the `User` is only an identity + ownership
anchor.

| Field | Type | Notes |
|-------|------|-------|
| `id` | `uuid` PK | generated |
| `email` | `varchar`, **unique**, not null | login identifier / contact |
| `displayName` | `varchar`, nullable | optional friendly name |
| `createdAt` | `timestamptz` | `@CreateDateColumn` |
| `updatedAt` | `timestamptz` | `@UpdateDateColumn` |

Relations: one-to-many to `Transaction`.

### Transaction (`transactions`)
A single recorded income or expense.

| Field | Type | Notes |
|-------|------|-------|
| `id` | `uuid` PK | generated |
| `userId` | `uuid` FK → `users.id`, **not null** | owner (Req 2.1) |
| `amount` | `numeric(19,4)` | precise decimal (see Money representation) |
| `type` | enum `income` \| `expense`, not null | closed enum (`transaction_type`) |
| `currency` | enum `COP` \| `USD`, not null | closed enum (`transaction_currency`) |
| `date` | `date`, not null | calendar day the money moved (no time-of-day) |
| `description` | `varchar`, nullable | user text |
| `createdAt` | `timestamptz` | |
| `updatedAt` | `timestamptz` | |

Both `type` and `currency` are implemented as Postgres enum types
(`transaction_type`, `transaction_currency`) for a closed domain. There is no
`accountId`, no `categoryId`, and no soft delete — deletes are physical.

## Money representation
- `amount` is stored as Postgres **`numeric(19,4)`** — a fixed-precision decimal
  with 4 fractional digits, enough for ISO 4217 minor units plus sub-unit
  precision, and 15 integer digits of headroom.
- TypeORM returns `numeric` columns as JavaScript `string` by default. The
  column uses a **`ColumnNumericTransformer`** that maps the DB value to a safe
  decimal string in the domain layer and back to a string on write.
- Rationale (Requirement 2.3): JavaScript `number` is IEEE-754 binary floating
  point and cannot represent many decimal fractions exactly (e.g. `0.1 + 0.2`),
  which corrupts monetary math. We therefore **never** map money to `float` /
  `number`; all arithmetic happens on the decimal type and the column stays
  `numeric`.

## Currency
- Each `Transaction` stores its own `currency` as a **closed enum**: `COP` or
  `USD`. There is no `User.defaultCurrency` and no account-level override.
- **No multi-currency conversion** is in scope: currencies are stored and
  returned as recorded. FX/normalization is a future spec and must not be
  assumed here.

## Relationships & integrity
- `Transaction.userId` is a **NOT NULL** FK to `users` — every transaction
  belongs to exactly one user (Req 2.1).
- `onDelete` policy: `Transaction.user` → `ON DELETE CASCADE` (deleting a user
  removes their transactions).
- Timestamps `createdAt` / `updatedAt` on every entity for auditability
  (Req 2.4). There is no `deletedAt`: transaction deletion is physical.

## Per-user isolation (Requirement 3)
Isolation is enforced in the repository/service layer: **every** data-access
method takes a `userId` and applies it in the `WHERE` clause. There is no
"find by id" that is not also scoped by `userId`, so one user can never read or
mutate another user's row (Req 3.1, 3.2).

Per entity we expose a feature service wrapping an injected TypeORM repository:

- **UsersService** — `create(dto)`, `findById(id)`, `findByEmail(email)`,
  `update(id, dto)`. (The `User` is the isolation anchor; its own lookups are by
  identity.)
- **TransactionsService** — all methods user-scoped:
  - `create(userId, dto)`
  - `findAll(userId, filter?)` (optional `type` / date-range filters, all AND-ed
    with `userId`)
  - `findOne(userId, transactionId)` → `WHERE id = :id AND userId = :userId`
  - `update(userId, transactionId, dto)`
  - `remove(userId, transactionId)` (physical delete, scoped by `userId`)

**Note:** PostgreSQL **Row-Level Security (RLS)** is a possible future
defense-in-depth reinforcement of this application-level scoping, but it is
**out of scope** here.

## Migrations (Requirement 4)
- A TypeORM **`DataSource`** (`backend/src/database/data-source.ts`) is defined
  for the CLI, reading `DATABASE_URL` from the environment, with
  `synchronize: false` and the migrations list pointing at `InitialSchema`.
- Migrations live in **`backend/src/database/migrations/`**, named
  `<timestamp>-<PascalCaseName>.ts` so execution order follows the timestamp
  prefix (e.g. `1730000000000-InitialSchema.ts`).
- The **initial migration** creates both tables:
  - the `transaction_type` enum (`income`, `expense`);
  - the `transaction_currency` enum (`COP`, `USD`);
  - table `users`;
  - table `transactions` with the `fk_transactions_user` FK (`ON DELETE
    CASCADE`) and the supporting index `transactions (user_id, date)`.
  Its `down` drops the two tables and then the two enums, rolling back cleanly.
  There is no seed migration (no categories to seed).
- pnpm scripts (in `backend/package.json`), run via the TypeORM CLI against the
  compiled DataSource:
  - `migration:generate` — generate a migration from entity diffs
  - `migration:run` — apply pending migrations
  - `migration:revert` — roll back the last migration
  - `migration:show` — list applied/pending

## Module structure (NestJS)
Files under `backend/src/` (all imports use `.js` extensions):

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
└── transactions/
    ├── transactions.module.ts
    ├── transactions.service.ts
    ├── entities/transaction.entity.ts
    └── dto/ (create-transaction.dto.ts, update-transaction.dto.ts,
              transaction-filter.dto.ts)
```

- **`DatabaseModule`** uses `TypeOrmModule.forRootAsync({ imports:
  [ConfigModule], inject: [ConfigService], useFactory })`, building options from
  `DATABASE_URL` with `synchronize: false`, `migrationsRun: false`, and the
  explicit `User` / `Transaction` entity and `InitialSchema` migration lists. It
  is imported once in `AppModule`.
- Each feature module registers its entity with
  `TypeOrmModule.forFeature([Entity])`, declares its service as a provider, and
  exports the service. `TransactionsModule` has no dependency on other feature
  modules (no account/category validation).
- `ConfigModule.forRoot({ isGlobal: true })` is registered in `AppModule`.

No controllers are defined in this spec (persistence only); HTTP endpoints are
added by later feature specs.

## Seed data
None. With categories removed from the model there is no seed migration.

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
  `findOne`/`update`/`remove` never return or mutate another user's rows, that
  `currency` is a closed `COP` | `USD` set, and that the numeric transformer
  round-trips money without float drift.
- `pnpm --dir backend migration:run` applies the initial schema cleanly against
  PostgreSQL 18.6 (via the dev container), and `migration:revert` rolls it back.

## Resolved decisions
These were previously open; they are now settled (approved by the user):
- **Minimal two-table model.** The data model is just `users` and
  `transactions`. The earlier `accounts` and `categories` entities were removed;
  a transaction no longer carries `accountId` or `categoryId`.
- **`users` table ownership.** This spec (`data-model-and-persistence`) creates
  the base `users` table (`id`, unique `email`, `displayName`, timestamps). The
  `user-authentication` spec adds credential columns via its own later
  migration on the same table, composing additively on top of this base. There
  is no duplicate `users` entity.
- **Currency is a closed enum.** `transaction_currency` is `COP` | `USD`. There
  is no `User.defaultCurrency`; each transaction records its own currency.
- **`Transaction.date` type.** Modeled as SQL `date` (calendar day, no
  time-of-day) for the MVP. Upgrading to `timestamptz` is a future change if
  ordering/insight precision ever requires it.
- **Deletes are physical.** Transactions have no soft-delete (`deletedAt`);
  `remove` performs a hard, user-scoped delete.
