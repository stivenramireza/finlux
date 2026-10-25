# Design — Transaction HTTP API

## Goal
Add an authenticated REST surface for the current user's transactions
(GET / POST / PUT / DELETE) on top of the already-implemented, user-scoped
`TransactionsService` (`data-model-and-persistence`) and `JwtAuthGuard` +
`@CurrentUser('userId')` (`user-authentication`). HTTP layer only: no data-model
changes, no change to the service's scoping logic, no auth changes.

This document is authored by the Tech Lead. It resolves the open questions left
in `requirements.md` and is authoritative for implementation. The Backend
Engineer implements against these decisions.

## Tech context (verified against the codebase)
- NestJS 12 on Node 24.22.1, ESM (`"type": "module"`); **all intra-project
  imports use explicit `.js` specifiers** (matches `auth.controller.ts`,
  `app.module.ts`).
- A **global `ValidationPipe`** is already configured in `src/main.ts` with
  `whitelist: true`, `forbidNonWhitelisted: true`, `transform: true`. This means
  unknown/extra body fields are rejected with `400` automatically (Req 2.5, 8.1)
  and server-assigned fields are stripped — we rely on it rather than re-adding
  a pipe.
- `class-validator` (0.15.1) and `class-transformer` (0.5.1) are already
  dependencies (via `user-authentication`); no new dependencies are introduced.
- `JwtAuthGuard` (`@nestjs/passport` `AuthGuard('jwt')`) and `@CurrentUser()`
  are implemented and unit-tested. `@CurrentUser('userId')` yields
  `AuthenticatedUser.userId` resolved by `JwtStrategy.validate`.
- `TransactionsService` (verified) exposes: `create(userId, dto)`,
  `findAll(userId, filter?)` (ordered `date DESC, createdAt DESC`),
  `findOne(userId, id)`, `findOneOrFail(userId, id)` (throws
  `NotFoundException`), `update(userId, id, dto)` (**partial** — applies only
  defined fields), `remove(userId, id)` (ownership-checked physical delete).
- `Transaction` entity fields: `id` (uuid), `userId`, `amount`
  (`numeric(19,4)` ↔ decimal **string** via the numeric transformer), `type`
  (`income`|`expense`), `currency` (`COP`|`USD`), `date` (`date`,
  `YYYY-MM-DD`), `description` (`varchar`|null), `createdAt`, `updatedAt`.
- Testing: Vitest; e2e via `@nestjs/testing` + `supertest` (both present), per
  the existing `test/app.e2e-spec.ts`.

## Resolved decisions (close the requirements' open questions)

### Decision 1 — Resource path and item identifier
- Route base: **`/transactions`**, implemented in a new
  `TransactionsController` inside the existing `transactions` feature module.
- Collection: `GET /transactions`, `POST /transactions`.
  Item: `GET /transactions/:id`, `PUT /transactions/:id`,
  `DELETE /transactions/:id`.
- `:id` is validated at the param level with Nest's built-in
  **`ParseUUIDPipe`** (`new ParseUUIDPipe({ version: '4' })` →
  `@Param('id', ParseUUIDPipe)`). A syntactically invalid uuid yields `400`
  **before** the service is touched (Req 4.3). This keeps "malformed id" (`400`)
  distinct from "well-formed but not owned / not found" (`404`).

### Decision 2 — PUT semantics: full, validated replace (resolves Req 5 ambiguity)
The requirement left PUT vs the service's partial `update` ambiguous. **Decision:
PUT is a full replace of the mutable fields.** Rationale: PUT is idempotent and
replace-semantics match the verb; it also makes Req 5.2 ("same validation as
create") verifiable without reinterpretation. Concretely:
- The PUT body uses the **same DTO as create** (`CreateTransactionDto`): `amount`,
  `type`, `currency`, `date` **required**, `description` optional.
- An omitted `description` on PUT means "clear it" → stored as `null` (replace
  semantics), not "leave unchanged".
- The controller passes the full validated set to `service.update(userId, id,
  dto)`. Because the service's `update` applies every **defined** field and we
  send all mutable fields (with `description` normalized to `null` when absent),
  the result is a deterministic full replace. No service change is required.
- A future **PATCH** (true partial update) is explicitly out of scope and may be
  added later; this is noted so the choice is intentional, not accidental.

### Decision 3 — `amount` validation: positive, scale ≤ 4, as a decimal string
Closes the "zero / scale" gap. `amount` is validated **as a string** (never
parsed to a JS number — Req 8.2) with `class-validator`:
- `@IsString()` + `@Matches(/^\d+(\.\d{1,4})?$/)` — a non-negative decimal with
  **at most 4 fractional digits** (matches the column `numeric(19,4)`; a 5th
  decimal is rejected with `400` rather than silently rounded).
- **Strictly positive**: zero (`0`, `0.0`, `0.0000`) is rejected. Enforced with
  a small custom constraint / `@Matches` that also forbids an all-zero mantissa
  (e.g. reject `^0+(\.0+)?$`). The sign lives in `type` (income/expense), so the
  amount itself is always `> 0`.
- Integer-digit bound: `@MaxLength` on the string (e.g. 25 chars) as a cheap
  guard against absurd input; the DB `precision: 19` is the hard limit.
- No `@IsNumber`/`@IsPositive` (those coerce to float and defeat the precision
  guarantee).

### Decision 4 — `date` validation: real calendar day
`date` is validated as a **real** `YYYY-MM-DD` day, not just the pattern, so
`2025-02-30` is rejected. Use `class-validator`'s `@IsDateString()` with
`{ strict: true }` plus a format assertion, or a focused custom validator that
parses to a UTC date and checks round-trip equality. **Future dates are
allowed** (product decision: users may pre-record upcoming items; later
insights specs may treat them specially). Documented so it is a deliberate
choice.

### Decision 5 — `description`: bounded free text, trimmed, empty → null
`description` is the one free-text PII field. Rules:
- Optional. `@IsOptional()` + `@IsString()` + `@MaxLength(500)` (reject longer
  with `400`). 500 mirrors a sensible note length; the column is `varchar`.
- `@Transform` to **trim** surrounding whitespace; a resulting **empty string is
  normalized to `null`** (so "blank" and "absent" converge to `null`).
- Not logged (Req 8.5).

### Decision 6 — List filters (`type`, `dateFrom`, `dateTo`) via a query DTO
A `ListTransactionsQueryDto` validates query params (the global `transform`
applies it):
- `type?` — `@IsOptional()` + `@IsEnum(TransactionType)` (`400` if not
  `income`|`expense`, Req 3.2).
- `dateFrom?`, `dateTo?` — same strict calendar-day validation as Decision 4
  (`400` if malformed, Req 3.3).
- **Inverted range** (`dateFrom > dateTo`): closes the requirement gap. Decision:
  reject with **`400`** (a custom cross-field check), rather than silently
  returning an empty list, because a reversed range is almost always a client
  bug and silent-empty hides it. The controller maps the DTO to the service's
  `TransactionFilter` (which stays an internal interface).

### Decision 7 — Create response `Location` header
`POST` returns `201` with the created transaction body **and** sets
`Location: /transactions/{id}` (REST nicety; cheap via `@Res({ passthrough:
true })` or `res.location(...)`). Not load-bearing; clients may ignore it.

### Decision 8 — DTOs: promote the plain interfaces to `class-validator` classes
The current `dto/*.ts` are plain interfaces (no runtime validation). We convert
them to **DTO classes** so the global pipe validates them:
- `CreateTransactionDto` (class) — `amount`, `type`, `currency`, `date`,
  `description?` with the constraints above. **Reused by PUT** (Decision 2).
- `ListTransactionsQueryDto` (class) — the query filters (Decision 6).
- The service signatures already accept structurally-compatible shapes; the
  classes remain assignable to the existing `CreateTransactionDto` /
  `UpdateTransactionDto` usage. The internal `UpdateTransactionDto` interface and
  `TransactionFilter` interface stay as the service's internal contract; the
  controller adapts the validated query DTO into `TransactionFilter`.

### Decision 9 — Serialization / response contract
- Responses return the `Transaction` entity as-is. `amount` is already a
  **string** (numeric transformer), `date` a `YYYY-MM-DD` string; `createdAt` /
  `updatedAt` serialize as ISO timestamps. The entity has **no secret fields**
  (unlike `user.password`), so no `@Exclude` is needed — but the design states
  this explicitly so it is a conscious contract.
- `DELETE` returns **`204 No Content`** with no body (`@HttpCode(204)`).

## Request/response contract (summary)

| Method & path | Guard | Success | Failure |
|---|---|---|---|
| `POST /transactions` | `JwtAuthGuard` | `201` + created tx, `Location` header | `400` validation; `401` no/invalid token |
| `GET /transactions` | `JwtAuthGuard` | `200` + tx[] (may be empty) | `400` bad filter; `401` |
| `GET /transactions/:id` | `JwtAuthGuard` | `200` + tx | `400` non-uuid id; `404` not owned/missing; `401` |
| `PUT /transactions/:id` | `JwtAuthGuard` | `200` + updated tx | `400` validation/non-uuid id; `404` not owned/missing; `401` |
| `DELETE /transactions/:id` | `JwtAuthGuard` | `204` no body | `400` non-uuid id; `404` not owned/missing; `401` |

Ownership is **always** the authenticated `userId` from `@CurrentUser('userId')`,
never from body/query/path (Req 1.4, 7). Not-owned and not-existent are
indistinguishable (`404`) because the service scopes by `userId` and
`findOneOrFail` throws `NotFoundException` (Req 4.2, 7.3).

## Module / file structure
```
backend/src/transactions/
├── transactions.controller.ts        # NEW — the REST surface
├── transactions.controller.spec.ts   # NEW — unit tests (mocked service)
├── transactions.module.ts            # MODIFIED — add the controller
├── transactions.service.ts           # UNCHANGED
└── dto/
    ├── create-transaction.dto.ts      # interface -> class-validator class
    ├── update-transaction.dto.ts      # kept as the service's internal contract
    ├── transaction-filter.dto.ts      # kept (internal service filter)
    └── list-transactions-query.dto.ts # NEW — validated query params
backend/test/
└── transactions.e2e-spec.ts           # NEW — full HTTP + auth e2e
```
`TransactionsModule` gains `controllers: [TransactionsController]`. It already
imports `TypeOrmModule.forFeature([Transaction])` and provides the service. The
controller depends on `JwtAuthGuard`, which requires the passport `jwt` strategy
registered by `AuthModule`; `AuthModule` is already imported in `AppModule`, so
the strategy is available app-wide. (If the e2e harness imports only a subset,
it must import `AuthModule` so the strategy is registered.)

## Error handling & security baseline
- Validation errors surface through Nest's default `BadRequestException` shape
  from the global pipe — no stack traces, SQL, tokens, or connection strings in
  responses (Req 8.3). No custom exception filter is needed.
- `404` via the service's `NotFoundException` with a generic message
  ("Transaction not found") — never discloses another user's data (Req 7.3).
- All access goes through `TransactionsService` (parameterized TypeORM); the
  controller performs **no** direct repository/raw queries (Req 8.4).
- The controller does not log bodies, amounts, descriptions, or tokens
  (Req 8.5).

## Testing strategy (Req 9.3)
Two layers, both Vitest:
1. **Controller unit tests** (`transactions.controller.spec.ts`) with a mocked
   `TransactionsService`: verify each handler passes the `@CurrentUser` id
   through, returns the right value, sets `204` on delete, and that
   `findOneOrFail`/service rejections propagate as `404`.
2. **e2e** (`transactions.e2e-spec.ts`, `@nestjs/testing` + `supertest`,
   mirroring `app.e2e-spec.ts`): boot the app (global pipe applied), then:
   - `401` with no / malformed / expired token on every verb.
   - Create→read→update→delete happy path (`201`/`200`/`200`/`204`), asserting
     `amount` round-trips as a **string** and the `Location` header on create.
   - Validation `400`s: bad `type`/`currency`, non-positive or >4-dp `amount`,
     impossible `date` (`2025-02-30`), inverted date range, extra unknown field,
     non-uuid `:id`.
   - **Per-user isolation**: user A cannot GET/PUT/DELETE user B's id → `404`,
     identical to a random non-existent id.
   The e2e needs a Postgres test DB (the dev container's 18.x). If the CI/dev DB
   is unavailable, the controller unit tests (layer 1) still cover the mapping
   logic; the e2e is the integration gate run where the DB exists.

## Verification
- `pnpm --dir backend lint`, `pnpm --dir backend format:check`,
  `pnpm --dir backend build`, `pnpm --dir backend test` all pass (Req 9.2).
- `pnpm --dir backend test:e2e` passes against a reachable Postgres.
- Manual/automated check of the contract table above, including the `401`/`400`/
  `404`/`204` status codes and the string `amount`.

## Out of scope (restated)
No data-model/migration changes, no auth changes, no NLP capture, no
categorization/Q&A/summaries, no FX conversion, no pagination/sorting beyond the
service default, no UI, and no real-money movement (product non-goal).

## Status
- Requirements: drafted (PM).
- Design: **complete (Tech Lead).** Open questions resolved above.
- Tasks (`tasks.md`): written (Tech Lead) — ready to implement.

Depends on: `data-model-and-persistence` (implemented), `user-authentication`
(implemented).
