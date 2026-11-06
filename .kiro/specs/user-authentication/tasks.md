# Tasks — User Authentication

Implementation plan. Backend-only (`backend/`), NestJS + TypeORM, ESM (`.js`
imports). Additive migrations on top of `data-model-and-persistence`; the
`sessions` table is plural and audit-only. No UI.

- [x] 1. Add and pin auth dependencies
  - Add `bcrypt` (+ `@types/bcrypt`), `@nestjs/jwt`, `@nestjs/passport`,
    `passport`, `passport-jwt` (+ `@types/passport-jwt`), `class-validator`,
    `class-transformer` to `backend/package.json` with exact pinned versions.
  - _Requirements: 2.1, 5.2_

- [x] 2. Add auth config keys
  - Document `JWT_SECRET`, `JWT_EXPIRES_IN=1h`, `BCRYPT_SALT_ROUNDS` in
    `backend/.env.example`; read them via `ConfigService` (by key name).
  - _Requirements: 5.1, 5.2_

- [x] 3. Add the `password` column to the User entity
  - Add `password` (`varchar`, NOT NULL, `select: false`) to the `user` entity;
    author the additive migration `AddUserPassword` and register it.
  - _Requirements: 2.1_

- [x] 4. Create the Session entity and audit migration
  - `session/entities/session.entity.ts` (plural table `sessions`): `id`,
    `user_id` FK → `users` (CASCADE), `token`, `expires_at`, timestamps; index on
    `user_id`. Author migration `CreateSessionTable` and register it.
  - _Requirements: 3.1_

- [x] 5. Implement the HashingService
  - `auth/hashing/hashing.service.ts`: bcrypt `hash`/`compare` using
    `BCRYPT_SALT_ROUNDS` (default 12).
  - _Added later (login timing fix / Decision 1): `compareWithDummy(plain)` —
    a genuine `bcrypt.compare` against a dummy hash generated once at the
    configured cost (cached), always `false`; used by the constant-cost failure
    paths in login and non-disclosing register._
  - _Requirements: 2.1_

- [x] 6. Implement the SessionService
  - `session/session.service.ts`: on login, insert an audit row with the
    SHA-256 hash of the JWT and `expires_at = now + 1h`.
  - _Requirements: 3.1_

- [x] 7. Implement register with password policy
  - `RegisterDto` with `class-validator` (>= 8 chars, upper, lower, digit,
    special); `AuthService.register` normalizes email, rejects duplicates,
    bcrypt-hashes, creates the user, returns no `password`.
  - _Superseded by task 14 (Decision 1): the "reject duplicates with 409"
    behavior implemented here is replaced by a non-disclosing generic response.
    The DTO/policy, email normalization, hashing, and no-`password` parts remain
    valid._
  - _Requirements: 1.1, 1.3, 2.1 (Req 1.2 superseded)_

- [x] 8. Implement login and JWT issuance
  - `LoginDto`; `AuthService.login` verifies via `bcrypt.compare`, returns a
    generic 401 on any failure, signs a 1h JWT (`JWT_SECRET`), and records a
    `session` row.
  - _Updated later (Decision 1 timing fix): the unknown-email branch runs
    `compareWithDummy(password)` before the generic 401, so both failure
    branches pay the same bcrypt cost (no account-enumeration timing oracle)._
  - _Requirements: 3.1, 3.2_

- [x] 9. Implement the JWT strategy, guard, and @CurrentUser decorator
  - `strategies/jwt.strategy.ts` (passport-jwt), `guards/jwt-auth.guard.ts`,
    `decorators/current-user.decorator.ts` resolving `userId` from the token.
  - _Requirements: 4.1, 4.2, 4.3_

- [x] 10. Wire the auth controller and modules
  - `auth.controller.ts` (`POST /auth/register`, `POST /auth/login`);
    `AuthModule` (`JwtModule.registerAsync`, `PassportModule`), `SessionModule`;
    import them in `AppModule`. Enable a global `ValidationPipe`.
  - _Requirements: 1.1, 3.1, 4.1_

- [~] 11. Protect financial endpoints
  - Apply `JwtAuthGuard` to endpoints that read/write financial data and pass
    the resolved `userId` to the existing user-scoped services.
  - _Note: No HTTP controllers for financial data exist yet (persistence-only
    so far), so there are no endpoints to guard at this point. The reusable
    `JwtAuthGuard` + `@CurrentUser()` are delivered and unit-tested (task 9);
    later feature specs that add financial endpoints MUST apply them via
    `@UseGuards(JwtAuthGuard)` and pass `@CurrentUser('userId')` to the
    user-scoped services._
  - _Requirements: 4.1, 4.2, 4.3_

- [x] 12. Write unit tests (Vitest)
  - Hashing (hash != plain, compare ok/ko); password policy (valid vs missing
    upper/digit/special/< 8); register (duplicate rejected; no `password` in
    response); login (generic 401; session row with `expires_at ~= +1h`); guard
    rejects without a valid token.
  - _The "duplicate rejected (409)" assertion is superseded by task 14's
    non-disclosure tests; the login generic-401 tests are extended by the
    timing-fix test (a bcrypt compare runs on the unknown-email branch)._
  - _Requirements: 1.3, 2.1, 3.2, 4.3 (Req 1.2 duplicate-409 superseded)_

- [x] 13. Verify build, lint, and migrations
  - `pnpm --dir backend build`, `lint`, `format:check`, `test` pass; apply the
    additive migrations against the dev DB (confirm `user.password` and the
    `session` table) and confirm `migration:revert` rolls back cleanly.
  - _Requirements: 2.1, 3.1, 4.1, 5.2_

- [x] 14a. Close the login account-enumeration timing oracle (Decision 1)
  - `HashingService.compareWithDummy(plain)`: genuine `bcrypt.compare` against a
    dummy hash generated once at the configured `saltRounds` (cached; cost
    tracks `BCRYPT_SALT_ROUNDS`), always `false`. `AuthService.login`: run it on
    the unknown-email branch before the generic 401, so both failure branches
    pay the same bcrypt cost. Update the misleading login docstring.
  - Tests: unknown-email branch exercises a bcrypt compare; identical generic
    401 for unknown-email vs wrong-password; `compareWithDummy` returns `false`,
    reuses the cache, and tracks the configured cost.
  - _Implemented and verified (Backend Engineer): `lint`/`format:check`/`build`/
    `test` (188) green; staged, not committed._
  - _Requirements: 3.2_

- [ ] 14b. Make registration non-disclosing (Decision 1)
  - `AuthService.register`: remove the `409 "Email is already registered"` (both
    the find-then-create pre-check and the `uq_users_email_bidx`
    unique-violation mapping). Instead:
    - always normalize + `email_bidx` + bcrypt-hash the submitted password (so
      timing is identical whether or not the email exists);
    - if the email is new → create the user (+ first password-history row) as
      today;
    - if the email already exists (pre-check or swallowed unique-violation) →
      create/modify nothing and still pay the equivalent bcrypt cost (the hash
      above and/or `compareWithDummy`), not short-circuiting before it;
    - return an **identical generic success-style response** in both cases, with
      no created record / id / `password` / case-dependent field; the controller
      must not auto-login or branch on the case.
  - Keep the DB `uq_users_email_bidx` constraint (integrity); only its
    surfacing changes.
  - Tests (Vitest): an already-registered email yields a response byte-identical
    to a newly-created one; no `409`; nothing persisted on the already-registered
    path; the bcrypt-cost work runs on both paths (timing symmetric); malformed
    input still rejected generically and identically regardless of email
    existence; no log discloses the case.
  - Verify `pnpm --dir backend lint`, `format:check`, `build`, `test` green.
  - _Requirements: 1.1, 1.2, 1.4, 1.5, 1.6_
