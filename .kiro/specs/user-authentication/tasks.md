# Tasks — User Authentication

Implementation plan. Backend-only (`backend/`), NestJS + TypeORM, ESM (`.js`
imports). Additive migrations on top of `data-model-and-persistence`; the
`session` table is singular and audit-only. No UI.

- [ ] 1. Add and pin auth dependencies
  - Add `bcrypt` (+ `@types/bcrypt`), `@nestjs/jwt`, `@nestjs/passport`,
    `passport`, `passport-jwt` (+ `@types/passport-jwt`), `class-validator`,
    `class-transformer` to `backend/package.json` with exact pinned versions.
  - _Requirements: 2.1, 5.2_

- [ ] 2. Add auth config keys
  - Document `JWT_SECRET`, `JWT_EXPIRES_IN=1h`, `BCRYPT_SALT_ROUNDS` in
    `backend/.env.example`; read them via `ConfigService` (by key name).
  - _Requirements: 5.1, 5.2_

- [ ] 3. Add the `password` column to the User entity
  - Add `password` (`varchar`, NOT NULL, `select: false`) to the `user` entity;
    author the additive migration `AddUserPassword` and register it.
  - _Requirements: 2.1_

- [ ] 4. Create the Session entity and audit migration
  - `session/entities/session.entity.ts` (singular table `session`): `id`,
    `user_id` FK → `user` (CASCADE), `token`, `expires_at`, timestamps; index on
    `user_id`. Author migration `CreateSessionTable` and register it.
  - _Requirements: 3.1_

- [ ] 5. Implement the HashingService
  - `auth/hashing/hashing.service.ts`: bcrypt `hash`/`compare` using
    `BCRYPT_SALT_ROUNDS` (default 12).
  - _Requirements: 2.1_

- [ ] 6. Implement the SessionService
  - `session/session.service.ts`: on login, insert an audit row with the
    SHA-256 hash of the JWT and `expires_at = now + 1h`.
  - _Requirements: 3.1_

- [ ] 7. Implement register with password policy
  - `RegisterDto` with `class-validator` (>= 8 chars, upper, lower, digit,
    special); `AuthService.register` normalizes email, rejects duplicates,
    bcrypt-hashes, creates the user, returns no `password`.
  - _Requirements: 1.1, 1.2, 1.3, 2.1_

- [ ] 8. Implement login and JWT issuance
  - `LoginDto`; `AuthService.login` verifies via `bcrypt.compare`, returns a
    generic 401 on any failure, signs a 1h JWT (`JWT_SECRET`), and records a
    `session` row.
  - _Requirements: 3.1, 3.2_

- [ ] 9. Implement the JWT strategy, guard, and @CurrentUser decorator
  - `strategies/jwt.strategy.ts` (passport-jwt), `guards/jwt-auth.guard.ts`,
    `decorators/current-user.decorator.ts` resolving `userId` from the token.
  - _Requirements: 4.1, 4.2, 4.3_

- [ ] 10. Wire the auth controller and modules
  - `auth.controller.ts` (`POST /auth/register`, `POST /auth/login`);
    `AuthModule` (`JwtModule.registerAsync`, `PassportModule`), `SessionModule`;
    import them in `AppModule`. Enable a global `ValidationPipe`.
  - _Requirements: 1.1, 3.1, 4.1_

- [ ] 11. Protect financial endpoints
  - Apply `JwtAuthGuard` to endpoints that read/write financial data and pass
    the resolved `userId` to the existing user-scoped services.
  - _Requirements: 4.1, 4.2, 4.3_

- [ ] 12. Write unit tests (Vitest)
  - Hashing (hash != plain, compare ok/ko); password policy (valid vs missing
    upper/digit/special/< 8); register (duplicate rejected; no `password` in
    response); login (generic 401; session row with `expires_at ~= +1h`); guard
    rejects without a valid token.
  - _Requirements: 1.2, 1.3, 2.1, 3.2, 4.3_

- [ ] 13. Verify build, lint, and migrations
  - `pnpm --dir backend build`, `lint`, `format:check`, `test` pass; apply the
    additive migrations against the dev DB (confirm `user.password` and the
    `session` table) and confirm `migration:revert` rolls back cleanly.
  - _Requirements: 2.1, 3.1, 4.1, 5.2_
