# Design — PII Encryption at Rest

## Goal
Encrypt sensitive PII at rest in the Finlux backend, transparently to callers.
Four fields are stored as ciphertext and decrypted on read via a TypeORM
`ValueTransformer`: `users.email`, `users.display_name`, `messages.content`
(both roles), and `transactions.description`. The email, now encrypted
(randomized), keeps its column name for display/return; a new deterministic
`email_bidx` (keyed HMAC over the normalized email) provides login lookup and
uniqueness. Application-level only; no frontend change.

This document is authored by the Tech Lead, folding the Solution Architect's
technical design. It is authoritative for implementation; the Backend Engineer
implements against it.

## Tech context (verified)
- NestJS 12, Node 24.22.1, ESM (`"type":"module"`, intra-project imports end in
  `.js`), TypeORM, PostgreSQL. Express platform.
- `node:crypto` is already used (`session.service.ts` → `createHash`); no new
  runtime dependency is required (AES-256-GCM + HMAC-SHA-256 are built in).
- Existing transparent-column pattern: `ColumnNumericTransformer`
  (`backend/src/database/column-numeric.transformer.ts`) — the encryption
  transformer mirrors it.
- Config via `@nestjs/config` `ConfigService`; fail-fast validation precedent in
  `JwtStrategy` and `DatabaseModule`.
- Email normalization today: `AuthService.normalizeEmail` = `trim().toLowerCase()`.

## Crypto design

### Cipher & envelope
- **AES-256-GCM** via `node:crypto` `createCipheriv`/`createDecipheriv`.
- **Per-value random 12-byte IV** (`randomBytes(12)`); **16-byte GCM auth tag**.
- Each encrypted column stores one ASCII envelope string:
  ```
  v1:<iv_b64>:<tag_b64>:<ciphertext_b64>
  ```
  - `v1` — fixed version tag, reserved for forward-compat (rotation is
    **out of scope**; the transformer rejects any unrecognized prefix).
  - standard base64 (not base64url); `:` is unambiguous (base64 has no `:`),
    split into exactly 4 parts.
- `encrypt(plaintext)` → envelope (random IV each call, so equal plaintext →
  different ciphertext, Req 3.2). `decrypt(envelope)` → plaintext; throws on a
  bad prefix/shape or a failed auth tag (Req 3.3).

### Blind index (email)
- `email_bidx = HMAC-SHA-256(BIDX_KEY, normalizeEmail(email))`, stored as
  lowercase hex. Deterministic → unique index + login lookup (Req 4).
- `normalizeEmail(email) = email.trim().toLowerCase()` — single source of truth
  in the crypto module; `AuthService.normalizeEmail` delegates to it so the auth
  normalization and the blind index never diverge.

### Keys (two separate secrets)
- `ENCRYPTION_KEY` — 32 bytes (AES-256), base64 in the env.
- `BIDX_KEY` — 32 bytes (HMAC), base64 in the env.
- Separate on purpose: the blind index is deterministic and leaks equality;
  keeping its key distinct from the confidentiality key limits blast radius
  (Req 5.1, 5.4).
- **Fail-fast at startup** (Req 5.3): the key holder throws a clear error if a
  key is missing or does not base64-decode to exactly 32 bytes, mirroring
  `JwtStrategy`/`DatabaseModule`.
- Documented in `backend/.env.example` by key name only; never committed, never
  logged (Req 5.2, 6.2).

### Key bootstrapping vs entity decorators (critical)
A `ValueTransformer` is instantiated at module-load (inside
`@Column({ transformer })`), **before** Nest DI / `ConfigService` exist. So the
transformer cannot read keys in its constructor. Resolution:
- A process-level singleton key holder (`crypto-keys.ts`) is initialized **once**
  at startup from the env vars: at the top of `bootstrap()` in
  `backend/src/main.ts` (before `NestFactory.create`) **and** in the standalone
  CLI `backend/src/database/data-source.ts` (which already loads env), so both
  the app and the migration CLI have keys.
- The transformer reads the singleton **lazily** inside `to()`/`from()` (never in
  its constructor), so entity module load never needs a key, but any real
  read/write does. If the holder is uninitialized when needed, it throws a clear
  error (only happens if bootstrap wiring is wrong).
- `CryptoService` (DI, reads `ConfigService`) and the transformer share the same
  underlying `crypto.ts` functions and the same initialized keys.

## Module / file structure
```
backend/src/crypto/                      # NEW
├── crypto.ts                            # encrypt(), decrypt(), blindIndex(), normalizeEmail()
├── crypto.spec.ts                       # unit tests (round-trip, tamper, determinism, null)
├── crypto-keys.ts                       # singleton holder: initCryptoKeys(), getKeys(); fail-fast
├── encrypted-column.transformer.ts      # EncryptedColumnTransformer + shared singleton
├── crypto.service.ts                    # @Injectable() wrapper (blindIndex/normalizeEmail for services)
└── crypto.module.ts                     # @Global() module providing CryptoService
```
- `crypto.ts` is framework-free (trivially unit-testable).
- `EncryptedColumnTransformer.to(v)`/`from(v)`: preserve `null`/`undefined`
  unchanged (Req 1.3); otherwise `encrypt`/`decrypt`.
- `CryptoModule` is `@Global()` so `CryptoService` is injectable app-wide
  (imported in `AppModule`).

## Entity wiring
- **`User`** (`users/entities/user.entity.ts`):
  - `email`: **remove `unique: true`**; add `transformer: encryptedColumnTransformer`
    (stores ciphertext, keeps the name).
  - `displayName` (`display_name`, nullable): add transformer.
  - **New** `emailBidx` → column `email_bidx`, `varchar`, NOT NULL, unique
    (DB-level constraint `uq_users_email_bidx`); no transformer (HMAC stored
    as-is).
  - `password` unchanged (`select: false`, no transformer). Only `password` uses
    `select: false`; encrypted columns are selected normally so `from()` decrypts
    on every read (including `findByEmailWithPassword`).
- **`Message`** (`chat/message.entity.ts`): `content` (`text`) add transformer
  (both roles).
- **`Transaction`** (`transactions/entities/transaction.entity.ts`):
  `description` (nullable) add transformer. `amount` keeps the numeric
  transformer; `type`/`currency`/`date` unchanged (still SQL-filterable).
- Column types hold the envelope without truncation: `email`/`display_name`/
  `description` stay unbounded `varchar`; `content` stays `text` (Req 8.4).

## Email flow (approach 1a)
Plaintext email is **never stored** (Req 4.1). Changes (verified against current
code):
- **`UsersService`** (`users/users.service.ts`): inject `CryptoService`.
  - `create(dto)`: persist `email: dto.email` (entity transformer encrypts it) +
    `emailBidx: crypto.blindIndex(crypto.normalizeEmail(dto.email))`.
  - `findByEmail(email)`: query `{ emailBidx: blindIndex(normalizeEmail(email)) }`
    (not `{ email }` — the ciphertext column is unsearchable).
  - `findByEmailWithPassword(email)`: same WHERE change; the returned
    `user.email` decrypts via the transformer.
  - `update(id, dto)`: unaffected (only `displayName` today). If email editing is
    added later, recompute `emailBidx`.
- **`AuthService`** (`auth/auth.service.ts`): `register` duplicate check and
  `login` already normalize then call the above — they now resolve via the blind
  index. `normalizeEmail` delegates to `crypto.normalizeEmail`. A same-email,
  different-case registration collides on `uq_users_email_bidx` → existing
  `ConflictException` (409) (Req 4.5). Recommended hardening: also catch the DB
  unique-violation and map to 409 (closes the pre-existing TOCTOU) — optional.
- **JWT**: `login` builds `{ sub, email: user.email }` and `JwtStrategy.validate`
  returns `{ userId, email }`; `user.email` is read through the entity (already
  decrypted), so the token keeps the plaintext email as today — no change.
  (Note: email lives in the signed token, not at rest; out of scope here.)
- **`SessionService`/`Session`**: unaffected (stores a SHA-256 token hash; FK to
  `users(id)`, not email).

## Migrations (Option B — rewrite in place; dev schema recreated)
The dev DB is disposable; the schema is recreated (`DROP SCHEMA public CASCADE;
CREATE SCHEMA public;`) then `migration:run`. Edit existing files in place; no
new encrypt migration. Follow the `create-orm-migration` skill (naming, up/down
symmetry).
- **`1730000000000-InitialSchema.ts`** (`users`, `transactions`):
  - `users`: drop `CONSTRAINT "uq_users_email" UNIQUE ("email")`; add
    `"email_bidx" varchar NOT NULL` with `CONSTRAINT "uq_users_email_bidx"
    UNIQUE ("email_bidx")`. `email`/`display_name` stay `varchar` (now hold
    ciphertext). `down()` mirrors (drop `email_bidx`/its constraint).
  - `transactions`: `description` stays `varchar` nullable (now ciphertext);
    `amount`/`type`/`currency`/`date`/`idx_transactions_user_id_date` unchanged.
- **`1730000003000-CreateConversationAndMessageTables.ts`**: `messages.content`
  stays `text` (now ciphertext); no DDL change needed.
- **Unaffected**: `1730000001000-AddUserPassword.ts` (bcrypt hash),
  `1730000002000-CreateSessionTable.ts` (SHA-256 token hash; FK to `users(id)`).

## Functional consequences (explicit)
- **No SQL over encrypted columns** (Req 7.1). Verified current code needs none:
  `TransactionsService.findAll` filters by `userId`/`type`/`date` only;
  `ConversationService`/messages filter by `userId`/`conversationId`/`createdAt`;
  `UsersService` moves from `email` to `email_bidx`. Any future text search over
  these fields must be done in app code over decrypted values.
- **Agent "duplicate concept in the same month" still works** (Req 7.3): the
  `list-transactions` tool filters by `date` (not encrypted) via `GET
  /transactions`; the entity read decrypts `description`; the agent compares
  **decrypted** descriptions in the model layer. Data path verified
  (`mcp/tools/list-transactions.tool.ts` → `TransactionApiClient.list` →
  `TransactionsController.findAll` → `TransactionsService.findAll` → entity
  decrypt).
- **No raw reads of encrypted columns**: use the repository `find*` APIs so the
  transformer applies; do NOT introduce `getRawOne/getRawMany`/raw SQL reads on
  encrypted columns (would expose ciphertext).
- **`amount` transformer** unaffected. **No plaintext/keys/envelopes logged**
  (Req 6): verified no `console.*` in `backend/src/**`; `TransactionApiClient`
  logs only method/status; `ChatService` logs only a generic failure line. The
  crypto code must never log plaintext/keys/envelopes.

## Configuration (`.env.example`)
Add an "Encryption (at-rest PII)" section (names only, no values):
```
ENCRYPTION_KEY=   # 32-byte AES-256-GCM key, base64. App fails fast if missing/invalid length.
BIDX_KEY=   # 32-byte HMAC-SHA-256 key for the email blind index, base64. Separate from ENCRYPTION_KEY.
```

## Testing strategy (Req 9.3)
Deterministic, no real secrets (tests inject fixed 32-byte base64 test keys via
`initCryptoKeys`; never read `.env`):
- **Unit** (`crypto.spec.ts`): round-trip for ASCII/Unicode/long strings;
  randomized IV (`encrypt(x) !== encrypt(x)`, both decrypt to `x`); envelope
  shape (IV 12 bytes, tag 16 bytes, `v1:` prefix); tamper detection (flipped
  ciphertext/tag or `v2:` prefix throws); null preservation; blind-index
  determinism (normalized `User@Example.com ` === `user@example.com`; different
  email differs; stable 64-char hex); key validation throws on missing/wrong
  length.
- **UsersService** (mocked repo): `findByEmail`/`findByEmailWithPassword` query
  `{ emailBidx }` not `{ email }`; `create` persists encrypted `email` + computed
  `emailBidx`; update `auth.service.spec.ts` for case-insensitive duplicate via
  the blind index.
- **E2E** (supertest, real Postgres): register→login happy path; register
  `User@Example.com` then `user@example.com` → 409 via `uq_users_email_bidx`;
  capture→confirm a transaction then `GET /transactions` returns plaintext
  `description`; chat turn then `GET /conversations/:id/messages` returns
  plaintext `content`; **at-rest assertion** via a raw `SELECT` that the stored
  `email`/`display_name`/`description`/`content` match the `v1:…` envelope and do
  not contain the plaintext, and `email_bidx` equals the expected HMAC; migration
  `run`→`revert`→`run` round-trip clean against a freshly dropped schema.

## Verification
- `pnpm --dir backend lint`, `format:check`, `build`, `test` pass (Req 9.2).
- `pnpm --dir backend test:e2e` passes against a reachable Postgres.
- Recreate the dev schema and `migration:run`; confirm the at-rest assertions and
  a clean `migration:revert` round-trip.

## Out of scope (restated)
Key rotation/versioning; encrypting `password`/session token; SQL search over
encrypted data; frontend changes; removing the email from the JWT.

## Status
- Requirements: PM-owned (see `requirements.md`). **Note:** at authoring time the
  `requirements.md` write was blocked by an environment permission rule on
  `.kiro/specs/**/requirements.md`; the content is drafted and must be persisted
  by a permitted actor. This design does not depend on that persistence to be
  implemented.
- Design: **complete (Tech Lead)**, folding the Solution Architect's design.
- Tasks (`tasks.md`): written (Tech Lead) against this design.

Depends on: `data-model-and-persistence`, `user-authentication`,
`conversational-agent-backend` (all implemented).
