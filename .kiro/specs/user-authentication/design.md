# Design — User Authentication

## Goal
Add email/password authentication to Finlux: register, login, a stateless JWT
access token (1-hour lifetime), route protection that resolves the current
user, and an audit `sessions` table. Builds additively on the `users` table from
`data-model-and-persistence`. No UI; backend only.

## Tech context
- NestJS on Node.js 24.22.1, ESM (`.js` imports), TypeScript, TypeORM,
  PostgreSQL 18.6 (the dev container runs an 18.x image; the target stays 18.6).
- Config via `@nestjs/config` (`ConfigService`), secrets by key name only.
- Schema via versioned migrations; `synchronize: false`.

New dependencies (pinned at implementation): `bcrypt` (+ `@types/bcrypt`),
`@nestjs/jwt`, `@nestjs/passport`, `passport`, `passport-jwt`
(+ `@types/passport-jwt`), `class-validator`, `class-transformer`. If native
`bcrypt` fails to build in the Docker/Railway image, `bcryptjs` is an allowed
drop-in fallback.

## Data model (additive migrations — do not touch the initial migration)

> **Cross-reference — PII encryption at rest.** The `email` is now stored
> encrypted; registration/login resolve the user through a deterministic
> `email_bidx` blind index (keyed HMAC over the normalized email) instead of the
> plaintext `email` column, and uniqueness is enforced on `email_bidx`. The
> login generic-401 behavior is unchanged. **Note:** registration no longer
> returns a `409` — it is now **non-disclosing** (identical generic response for
> new vs already-registered, timing-equivalent), per Requirement 1 / Decision 1.
> The DB-level `uq_users_email_bidx` unique constraint stays (data integrity);
> what changes is that its violation is handled silently, not surfaced as a
> `409`. See `.kiro/specs/pii-encryption-at-rest/` for the authoritative
> encryption design.

### `users` table — new column `password`
- `password` (`varchar`, NOT NULL): stores the **bcrypt hash** (the column name
  is literally `password`; it never holds plaintext). On the entity it is mapped
  with `select: false` so it is never returned/serialized unless explicitly
  selected.

### new `sessions` table (plural) — audit only
| Field | Type | Notes |
|-------|------|-------|
| `id` | `uuid` PK | generated |
| `user_id` | `uuid` FK → `user.id`, NOT NULL | `ON DELETE CASCADE` |
| `token` | `varchar`, NOT NULL | **SHA-256 hash** of the issued JWT (never the raw token) |
| `expires_at` | `timestamptz`, NOT NULL | login time + 1h (derived from the JWT) |
| `created_at` | `timestamptz` | `@CreateDateColumn` |
| `updated_at` | `timestamptz` | `@UpdateDateColumn` |

Index on `user_id`. The `sessions` table is **audit only**: it records who logged
in and when the session expires. The auth guard does **not** read it; token
validity is determined statelessly by JWT signature + expiry.

## Password hashing
- `HashingService` wraps bcrypt: `hash(plain)`, `compare(plain, hash)`, and
  `compareWithDummy(plain)`.
- Cost factor from `BCRYPT_SALT_ROUNDS` (default 12). bcrypt embeds a per-hash
  salt, so identical passwords yield different hashes.
- `compareWithDummy(plain)` performs a genuine `bcrypt.compare` of `plain`
  against a dummy hash generated **once** at the configured `saltRounds` (cached,
  so no per-call `bcrypt.hash`), always resolving `false`. It exists so a
  failure path with **no matching user** (login) or an **already-registered
  email** (register) can spend the same bcrypt time as the real path, closing an
  account-enumeration **timing** oracle. The dummy's cost tracks
  `BCRYPT_SALT_ROUNDS` even when overridden, so the timing stays symmetric.
- Credentials and the dummy value are never logged.

## Token / session
- Access-only JWT (no refresh), signed with `JWT_SECRET`, lifetime
  `JWT_EXPIRES_IN=1h`. Payload: `sub` (userId), `email`.
- On login, a `session` row is inserted with the SHA-256 hash of the token and
  `expires_at = now + 1h`.
- Logout is client-side (the client discards the token); the token expires on
  its own after one hour. There is no server-side revocation, consistent with
  the audit-only `sessions` table.

## Flows
- `POST /auth/register` (**non-disclosing**, Req 1 / Decision 1): validate input
  + password policy (generic validation error on malformed input, applied
  identically regardless of email existence); normalize email (trim +
  lowercase); compute `email_bidx`; **always** bcrypt-hash the submitted
  password (so the timing is the same whether or not the email exists).
  - If the email is **new**: create the `user` in the usual transaction (user +
    first password-history row).
  - If the email is **already registered** (detected via the pre-check and/or
    the `uq_users_email_bidx` unique-violation on insert): do **not** create or
    modify anything, and do **not** surface a `409`. Swallow the unique-violation
    and fall through to the same generic response. To keep timing symmetric, the
    already-registered path still performs the equivalent bcrypt work (the hash
    above, and/or `compareWithDummy`) — it must not short-circuit before the
    bcrypt cost is paid.
  - Respond with an **identical, generic success-style response** in both cases
    (e.g. `201`/`200` with a neutral body), never exposing the created record,
    its id, `password`, or any field that differs between the two cases. The
    controller SHALL NOT auto-login or otherwise branch on which case occurred.
- `POST /auth/login`: load the user by `email_bidx` selecting `password`. On
  **unknown email**, call `compareWithDummy(password)` (constant-cost bcrypt)
  then throw the generic `401`; on **found user**, `bcrypt.compare`; on mismatch
  throw the **identical generic 401** (Req 3.2). On success sign a JWT, insert a
  `session` audit row, and return the token. Both failure branches pay the same
  bcrypt cost (no timing oracle).
- Logout: client-side; no server state change required (Req 3.3 is satisfied by
  natural expiry + client token disposal).

## Route protection (Requirement 4)
- `JwtStrategy` (passport-jwt) validates signature + expiry and loads the user.
- `JwtAuthGuard` guards every endpoint that touches financial data; no valid
  token → 401 (Req 4.3).
- `@CurrentUser()` decorator extracts `userId` from the token; controllers pass
  it to the existing user-scoped services (ties to `data-model-and-persistence`
  Requirement 3).

## Password policy (Requirement 1.3)
Enforced in the register DTO with `class-validator`: minimum 8 characters, and
at least one uppercase letter, one lowercase letter, one digit, and one special
character.

## Configuration (Requirement 5)
New keys in `backend/.env.example` (documented, no values): `JWT_SECRET`,
`JWT_EXPIRES_IN=1h`, `BCRYPT_SALT_ROUNDS`. Read via `ConfigService` by key name;
never hard-coded, never committed.

## Module structure (NestJS)
```
backend/src/auth/
├── auth.module.ts              # JwtModule.registerAsync + PassportModule
├── auth.service.ts             # register, validateUser, login (sign + audit)
├── auth.controller.ts          # /auth/register, /auth/login
├── hashing/hashing.service.ts  # bcrypt hash/compare
├── strategies/jwt.strategy.ts  # passport-jwt
├── guards/jwt-auth.guard.ts
├── decorators/current-user.decorator.ts
└── dto/ (register.dto.ts, login.dto.ts)
backend/src/session/
├── session.module.ts
├── session.service.ts          # records audit rows
└── entities/session.entity.ts
backend/src/database/migrations/
├── <ts>-AddUserPassword.ts      # adds user.password
└── <ts>-CreateSessionTable.ts   # creates sessions
```

## Security baseline
- Passwords stored only as bcrypt hashes; never logged or returned.
- `session` stores only a SHA-256 hash of the token, never the raw token.
- Secrets from the environment by key name; parameterized queries via TypeORM.

## Verification
- `pnpm --dir backend build`, `lint`, `format:check` pass.
- Vitest: hashing (hash ≠ plain, compare ok/ko; `compareWithDummy` returns
  `false`, reuses the cached dummy, cost tracks `BCRYPT_SALT_ROUNDS`); password
  policy (accepts a valid password, rejects missing uppercase / digit / special
  / < 8); **register non-disclosure** (an already-registered email yields a
  response byte-identical to a newly-created one; no `409`; no `password`/id in
  the body; nothing created on the already-registered path; the bcrypt-cost work
  runs on the already-registered path so timing is symmetric); login (generic
  401 on bad credentials, with a bcrypt compare exercised on the unknown-email
  branch; inserts a `session` row with `expires_at ≈ login + 1h`); guard rejects
  requests without a valid token.
- Migrations apply against the dev DB; `user` has `password`, `session` exists
  with `token`/`expires_at`; `migration:revert` rolls back cleanly.
