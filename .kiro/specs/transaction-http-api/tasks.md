# Tasks — Transaction HTTP API

Implementation plan. Backend-only (`backend/`), NestJS 12 + TypeORM, ESM
(`.js` import specifiers). HTTP layer only — no data-model, service-scoping, or
auth changes. Builds on the implemented user-scoped `TransactionsService`
(`data-model-and-persistence`) and `JwtAuthGuard` + `@CurrentUser('userId')`
(`user-authentication`). No new dependencies (`class-validator` /
`class-transformer` already present; the global `ValidationPipe` is already in
`main.ts`).

Prefer `package.json` scripts: `pnpm --dir backend lint`,
`pnpm --dir backend build`, `pnpm --dir backend format:check`,
`pnpm --dir backend test`, `pnpm --dir backend test:e2e`.

- [x] 1. Convert the create DTO to a validated `class-validator` class
  - Rewrite `transactions/dto/create-transaction.dto.ts` from an interface to a
    class: `amount` (`@IsString` + `@Matches(/^\d+(\.\d{1,4})?$/)` + reject
    all-zero so it is strictly positive + `@MaxLength(25)`), `type`
    (`@IsEnum(TransactionType)`), `currency` (`@IsEnum(TransactionCurrency)`),
    `date` (strict real-calendar-day `YYYY-MM-DD`, e.g. `@IsDateString` strict +
    format assertion or a focused custom validator), `description?`
    (`@IsOptional` + `@IsString` + `@MaxLength(500)` + `@Transform` trim →
    empty-to-`null`). Keep it assignable to the service's create input.
  - _Requirements: 2.2, 2.3, 2.4, 8.1, 8.2 · Design: Decisions 3, 4, 5, 8_

- [x] 2. Add the validated list-query DTO
  - Create `transactions/dto/list-transactions-query.dto.ts`:
    `type?` (`@IsOptional` + `@IsEnum(TransactionType)`), `dateFrom?` / `dateTo?`
    (same strict calendar-day validation as task 1), and a cross-field check
    rejecting `dateFrom > dateTo` with `400`. Provide a mapping to the internal
    `TransactionFilter` shape.
  - _Requirements: 3.2, 3.3, 8.1 · Design: Decision 6_

- [x] 3. Implement the `TransactionsController`
  - Create `transactions/transactions.controller.ts`, base path `/transactions`,
    annotated `@UseGuards(JwtAuthGuard)` (class-level). Handlers:
    - `POST /` → `@HttpCode(201)`, `create(@CurrentUser('userId'), @Body()
      CreateTransactionDto)`, set `Location: /transactions/{id}` (passthrough
      res), return the created tx.
    - `GET /` → `findAll(userId, query)` mapping `ListTransactionsQueryDto` →
      `TransactionFilter`; return the array (may be empty, `200`).
    - `GET /:id` → `@Param('id', new ParseUUIDPipe({ version: '4' }))`,
      `findOneOrFail(userId, id)` → `200` or `404`.
    - `PUT /:id` → uuid param pipe + `@Body() CreateTransactionDto` (full
      replace, Decision 2); normalize absent `description` to `null`; call
      `update(userId, id, dto)` → `200` or `404`.
    - `DELETE /:id` → uuid param pipe, `@HttpCode(204)`, `remove(userId, id)` →
      `204` or `404`.
  - Ownership comes solely from `@CurrentUser('userId')`; never read a user id
    from body/query/path. No direct repository/raw queries.
  - _Requirements: 1.1, 1.2, 1.4, 2.1, 2.6, 3.1, 3.4, 4.1, 4.2, 4.3, 5.1, 5.3,
    5.4, 6.1, 6.2, 7.1, 7.2, 7.3, 8.3, 8.4 · Design: Decisions 1, 2, 7, 9_

- [x] 4. Register the controller in the module
  - Add `controllers: [TransactionsController]` to `transactions.module.ts`
    (keep the existing `TypeOrmModule.forFeature([Transaction])` import and the
    service provider/export). No change to `AppModule` (the passport `jwt`
    strategy is already registered by the imported `AuthModule`).
  - _Requirements: 9.1 · Design: "Module / file structure"_

- [x] 5. Controller unit tests (Vitest, mocked service)
  - `transactions.controller.spec.ts`: mock `TransactionsService`; assert each
    handler forwards the `userId` from `@CurrentUser`, returns the service
    result, sets `204` on delete, sets the `Location` header on create, and that
    a `NotFoundException` from `findOneOrFail`/`update`/`remove` propagates
    (→ `404`).
  - _Requirements: 9.3 · Design: "Testing strategy" (layer 1)_

- [x] 6. End-to-end tests (Vitest + supertest)
  - `test/transactions.e2e-spec.ts` (mirror `app.e2e-spec.ts`; ensure the global
    `ValidationPipe` from `main.ts` is applied in the test app, and `AuthModule`
    is available so the `jwt` strategy is registered). Cover:
    - `401` on every verb with no / malformed / expired bearer token.
    - Happy path create→list→get→update→delete (`201`/`200`/`200`/`200`/`204`),
      asserting `amount` round-trips as a **string** and the create `Location`
      header.
    - `400`s: bad `type`/`currency`, non-positive or 5-decimal `amount`,
      impossible `date` (`2025-02-30`), inverted `dateFrom>dateTo`, unknown extra
      field, non-uuid `:id`.
    - Per-user isolation: user A → user B's id returns `404`, identical to a
      random non-existent uuid (no disclosure).
  - _Requirements: 1.3, 2.5, 3.2, 3.3, 4.3, 7.2, 7.3, 8.1, 9.3 · Design:
    "Testing strategy" (layer 2)_

- [x] 7. Verify build, lint, format, and tests
  - Run `pnpm --dir backend lint`, `pnpm --dir backend format:check`,
    `pnpm --dir backend build`, and `pnpm --dir backend test`; fix any issues.
    Run `pnpm --dir backend test:e2e` against a reachable Postgres (dev
    container). If the DB is unavailable in the environment, note it: the unit
    tests (task 5) gate the mapping logic and the e2e runs where the DB exists.
  - _Requirements: 9.2, 9.3 · Design: "Verification"_

## Notes
- No new runtime dependencies; no data-model/migration/auth changes.
- `description` and `amount` are sensitive PII — do not log them (Req 8.5).
- PUT is a **full replace** (Decision 2). A true partial `PATCH` is intentionally
  out of scope and can be a later addition.
- `requirements.md` still carries a few items as "open questions for design";
  those are now **resolved in `design.md`** (Decisions 1–9). The requirements
  are PM-owned, so they are not edited here — the authoritative resolutions live
  in the design.

Depends on: `data-model-and-persistence` (implemented), `user-authentication`
(implemented).
