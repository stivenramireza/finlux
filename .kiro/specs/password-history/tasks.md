# Tasks — Password History (no reuse of past passwords)

Implementation plan. Backend-only (`backend/`, NestJS 12 + TypeORM, ESM `.js`
specifiers). Additive on `user-authentication`, `data-model-and-persistence`,
`password-reset` (all implemented). Keeps a per-user `password_history` of bcrypt
hashes and rejects reuse of the last **N = 5** (incl. the current password) on
every set-password event (registration + reset; future change-password reuses
the rule). No change to the auth mechanism, JWT/session model, or the
reset-token lifecycle beyond the new reuse `400`.

> Authored by the Tech Lead (folding the Solution Architect's analysis);
> persisted by the PM on the Tech Lead's behalf (no write tool in that role
> here). Implementation delegated to the Backend Engineer. `.kiro/specs/**`
> checkboxes are marked by the Tech Lead/PM (engineers are read-only on specs).

Prefer `package.json` scripts: `pnpm --dir backend lint`,
`pnpm --dir backend format:check`, `pnpm --dir backend build`,
`pnpm --dir backend test`, `pnpm --dir backend test:e2e`,
`pnpm --dir backend migration:run` / `migration:revert` / `migration:show`.

- [x] 1. Add the history-depth config key
  - Document `PASSWORD_HISTORY_DEPTH` (default `5`) in `backend/.env.example`
    with a one-line note (recent passwords incl. the current one; clamped ≥1).
    Read via `ConfigService` by key name.
  - _Requirements: 4.1, 4.2 · Design: Configuration_

- [x] 2. Create the `PasswordHistory` entity + migration
  - `password-history/entities/password-history.entity.ts` (table
    `password_history`): `id` uuid PK, `userId` (`user_id`) uuid NOT NULL FK →
    `users` (CASCADE), `passwordHash` (`password_hash`) varchar NOT NULL (no
    `select:false`), `createdAt` only (immutable). Mirror the style of
    `password-reset-token.entity.ts` / `session.entity.ts`.
  - `database/migrations/1730000005000-CreatePasswordHistoryTable.ts`: create the
    table with `pk_password_history`, `fk_password_history_user` (CASCADE), and
    index `idx_password_history_user_id_created_at` on `(user_id, created_at)`;
    `down()` drops the index then the table. Mirror
    `1730000004000-CreatePasswordResetTokenTable.ts`.
  - Register the entity **and** migration in **both** `database/data-source.ts`
    and `database/database.module.ts` (entities + migrations arrays, `.js`
    imports).
  - _Requirements: 1.1, 1.2, 1.3 · Design: Decision 3_

- [x] 3. (Optional) Extract a `HashingModule`
  - Create `auth/hashing/hashing.module.ts` providing/exporting `HashingService`
    and import it in `AuthModule`, `PasswordResetModule`, and the new
    `PasswordHistoryModule`, removing the by-value duplication. If declined, keep
    providing `HashingService` by value in each module (functionally equivalent;
    note the choice).
  - _Requirements: 7.1 · Design: Decision 4_

- [x] 4. Implement `PasswordHistoryService` + module
  - `password-history/password-history.service.ts`:
    - `assertNotReused(userId, plaintext)`: load the N most recent
      (`ORDER BY created_at DESC LIMIT N`), bcrypt-`compare` with **short-circuit**
      (stop at first match), **current (most recent) first**; on a match throw
      `BadRequestException` with the **reuse message** (distinct from the
      invalid-token message). Clamp `N ≥ 1`.
    - `record(userId, hash, manager?)`: insert the hash, then **prune** to the N
      most recent (delete-on-insert per Design 3); accept an optional
      `EntityManager` to join the caller's transaction.
  - `password-history/password-history.module.ts`:
    `TypeOrmModule.forFeature([PasswordHistory])`, imports `HashingModule` (or
    provides `HashingService` by value) + `ConfigModule`; provides/exports
    `PasswordHistoryService`. Does **not** inject `UsersService` (avoid cycles).
  - _Requirements: 2.4, 3.1, 3.2, 3.3, 3.4, 4.2, 5.2, 6.1 · Design: Decisions 2, 3, 4_

- [x] 5. Make `UsersService` transaction-aware (additive)
  - `users/users.service.ts`: add an optional `manager?: EntityManager` to
    `create(dto, manager?)` and `updatePassword(id, hash, manager?)`, using the
    passed manager's repository when provided (else the injected repo). No
    behavior change when omitted.
  - _Requirements: 1.3 · Design: Decisions 1, 5_

- [x] 6. Seed history on registration (atomic)
  - `auth/auth.service.ts` `register`: after the duplicate pre-check and
    `hash()`, run `dataSource.transaction(manager => { user =
    usersService.create(dto, manager); passwordHistory.record(user.id,
    passwordHash, manager); })`; keep the `23505 → 409` mapping wrapping the
    transaction (rollback leaves no orphan history). Import `PasswordHistoryModule`
    (and `DataSource`) into `AuthModule`/the service. Reuse-check is a no-op in
    register (empty history) — do not call `assertNotReused` here.
  - _Requirements: 2.1 · Design: Decision 5_

- [x] 7. Integrate the rule into the reset confirm
  - `auth/password-reset/password-reset.service.ts` `confirm`: reorder per
    Design 1 — (a) look up + read-only validity check (generic `400`, no
    consume); (b) `passwordHistory.assertNotReused(token.userId, newPassword)`
    **before** consuming (reuse → `400` reuse message, token stays live);
    (c) atomic consume (`affected>=1` or generic `400`); (d) in one transaction,
    `updatePassword(userId, hash, manager)` + `passwordHistory.record(userId,
    hash, manager)`. Import `PasswordHistoryModule` into `PasswordResetModule`.
  - _Requirements: 2.2, 3.1, 3.2, 5.1, 5.2, 5.3 · Design: Decision 1_

- [x] 8. Unit tests (Vitest)
  - `password-history.service.spec.ts`: `record` inserts then prunes to N;
    `assertNotReused` rejects a match on the current or a recent prior within N,
    accepts a password older than N (out of window), short-circuits at first
    match, compares current first; N clamps ≥1; only hashes used.
  - `auth.service.spec.ts`: register records a first history row; `23505` →
    `409` with no orphan history (rollback).
  - `password-reset.service.spec.ts`: reused new password → `400` reuse message,
    token **not** consumed, password unchanged, no history added; fresh valid
    password → token consumed + password updated + history recorded; token
    message stays generic and distinct from the reuse message.
  - _Requirements: 2.1, 2.2, 3.1, 3.2, 5.2, 7.3 · Design: "Testing strategy"_

- [x] 9. E2E tests (Vitest + supertest; real Postgres)
  - `test/password-history.e2e-spec.ts` (or extend `password-reset.e2e-spec.ts`):
    register → reset to a new password → attempt to reset back to a recent/just-set
    password → `400` reuse; reset to a genuinely new password succeeds; after N+1
    distinct resets the oldest password is reusable again (window of N). Assert the
    DB stores bcrypt hashes, never plaintext.
  - _Requirements: 3.1, 4.2, 6.1, 7.3 · Design: "Testing strategy"_

- [x] 10. Verify build, lint, format, tests, and migration round-trip
  - Run `pnpm --dir backend lint`, `format:check`, `build`, `test`; fix issues.
    Run `migration:run` (creates `password_history`), `migration:show` `[X]`, then
    `migration:revert` round-trip and `migration:run` again. Run `test:e2e`
    against a reachable Postgres. If the DB is unavailable, note it: unit tests
    gate the reuse/record/prune + reorder logic; e2e + migration run where a DB
    exists.
  - _Requirements: 7.2, 7.3 · Design: "Verification"_

## Notes
- **Reuse-check before consume** (Design 1): a reuse rejection does NOT burn the
  reset token; the user retries on the same link. The atomic consume remains the
  race barrier.
- **Current password is a history row** (Design 2): the N-window is read solely
  from `password_history` (`LIMIT N`); the hash is intentionally duplicated in
  `users.password` and the newest history row for consistency.
- **No cycles** (Design 4): `PasswordHistoryService` injects only its repo +
  `HashingService` + `ConfigService`; never `UsersService`.
- **Non-disclosure**: the reuse message is distinct only at the confirm step
  (post valid token); the invalid/expired/used token `400` stays generic. The
  request step of `password-reset` is unchanged.
- **DoS**: register adds zero bcrypt-compares (empty history → no-op); the N
  compares occur only on reset (token + cooldown) and a future change-password
  (JWT guard).
- Scope guard: no password expiry/rotation, no similarity/breach checks, no
  change-password endpoint (forward-compat only), no frontend change beyond the
  reuse `400` already surfaced by the reset confirm UI.

Depends on: `user-authentication`, `data-model-and-persistence`, `password-reset`
(all implemented).
