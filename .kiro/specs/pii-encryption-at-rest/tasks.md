# Tasks — PII Encryption at Rest

Implementation plan. Backend-only (`backend/`), NestJS 12 + TypeORM, ESM (`.js`
import specifiers). Application-level at-rest encryption of four PII fields via a
TypeORM `ValueTransformer`, plus an email blind index for login/uniqueness. No
frontend change. Dev DB is disposable: migrations are rewritten in place
(Option B) and the schema is recreated. No new runtime dependency (`node:crypto`
is built in).

Prefer `package.json` scripts: `pnpm --dir backend lint`,
`pnpm --dir backend format:check`, `pnpm --dir backend build`,
`pnpm --dir backend test`, `pnpm --dir backend test:e2e`,
`pnpm --dir backend migration:run` / `migration:revert` / `migration:show`.

- [ ] 1. Add the crypto key holder with fail-fast validation
  - `crypto/crypto-keys.ts`: a process-level singleton holding the decoded
    `ENCRYPTION_KEY` (32 bytes, AES-256) and `BIDX_KEY` (32 bytes, HMAC),
    base64-decoded. `initCryptoKeys(read)` initializes once (idempotent);
    `getKeys()` returns them or throws if uninitialized. Throw a clear error if a
    key is missing or does not decode to exactly 32 bytes.
  - _Requirements: 5.1, 5.3, 5.4 · Design: "Keys", "Key bootstrapping"_

- [ ] 2. Implement the framework-free crypto functions
  - `crypto/crypto.ts`: `encrypt(plaintext)` (AES-256-GCM, random 12-byte IV,
    16-byte tag) → `v1:<iv_b64>:<tag_b64>:<ciphertext_b64>`;
    `decrypt(envelope)` → plaintext, throwing on bad prefix/shape or auth-tag
    failure; `blindIndex(normalized)` → lowercase hex HMAC-SHA-256;
    `normalizeEmail(email)` → `trim().toLowerCase()`. Reads keys via `getKeys()`.
    Never log plaintext/keys/envelopes.
  - _Requirements: 3.1, 3.2, 3.3, 4.2, 4.4, 6.1, 6.2 · Design: "Cipher & envelope", "Blind index"_

- [ ] 3. Implement the encrypted-column transformer
  - `crypto/encrypted-column.transformer.ts`: `EncryptedColumnTransformer`
    implements `ValueTransformer`; `to(v)`/`from(v)` preserve `null`/`undefined`
    unchanged, otherwise `encrypt`/`decrypt` (read keys lazily — never in the
    constructor). Export a shared singleton `encryptedColumnTransformer`
    (mirrors `columnNumericTransformer`).
  - _Requirements: 1.1, 1.3, 2.1, 2.2 · Design: "Key bootstrapping", "Module/file structure"_

- [ ] 4. Implement CryptoService + a global CryptoModule
  - `crypto/crypto.service.ts`: `@Injectable()` wrapper exposing
    `encrypt/decrypt/blindIndex/normalizeEmail`; constructor reads both keys via
    `ConfigService` and calls `initCryptoKeys` (idempotent). `crypto/crypto.module.ts`:
    `@Global()` module providing/exporting `CryptoService`. Import `CryptoModule`
    in `AppModule`.
  - _Requirements: 5.1, 5.2 · Design: "Module/file structure"_

- [ ] 5. Initialize keys at both bootstrap paths
  - `main.ts`: call `initCryptoKeys` at the top of `bootstrap()` (before
    `NestFactory.create`). `database/data-source.ts`: initialize keys for the CLI
    path (it already loads env). Both fail fast on missing/invalid keys.
  - _Requirements: 5.3 · Design: "Key bootstrapping"_

- [ ] 6. Wire the transformer onto the encrypted entity columns
  - `users/entities/user.entity.ts`: remove `unique: true` from `email`; add
    `transformer: encryptedColumnTransformer` to `email` and `displayName`; add a
    new `emailBidx` property → column `email_bidx` (`varchar`, NOT NULL, unique at
    DB level), no transformer. `password` unchanged.
  - `chat/message.entity.ts`: add the transformer to `content`.
  - `transactions/entities/transaction.entity.ts`: add the transformer to
    `description` (keep the numeric transformer on `amount`).
  - _Requirements: 1.1, 1.3, 4.1, 4.3 · Design: "Entity wiring"_

- [ ] 7. Route email lookups through the blind index
  - `users/users.service.ts`: inject `CryptoService`. `create` persists `email`
    (encrypted by the transformer) + `emailBidx = blindIndex(normalizeEmail(email))`.
    `findByEmail` / `findByEmailWithPassword` query by `{ emailBidx }` (not
    `{ email }`). `auth/auth.service.ts`: delegate `normalizeEmail` to the crypto
    module; register/login resolve via the blind index (409 duplicate / generic
    401 unchanged). Optionally map a DB unique-violation on `email_bidx` to 409.
  - _Requirements: 4.2, 4.3, 4.4, 4.5, 4.6 · Design: "Email flow"_

- [ ] 8. Rewrite the migrations in place (Option B) + register nothing new
  - Activate and follow the `create-orm-migration` skill.
  - `1730000000000-InitialSchema.ts`: drop `uq_users_email`; add
    `email_bidx varchar NOT NULL` + `uq_users_email_bidx` UNIQUE; keep
    `email`/`display_name` as `varchar` and `transactions.description` as
    `varchar` (now hold ciphertext). `down()` mirrors `up()`.
  - `1730000003000-CreateConversationAndMessageTables.ts`: `messages.content`
    stays `text` (now ciphertext) — comment only; no DDL change.
  - `AddUserPassword` and `CreateSessionTable` unaffected. No new migration file;
    no change to the migration arrays.
  - _Requirements: 8.1, 8.2, 8.4 · Design: "Migrations"_

- [ ] 9. Document the keys in `.env.example`
  - Add an "Encryption (at-rest PII)" section documenting `ENCRYPTION_KEY` and
    `BIDX_KEY` (names only, no values; note base64 32 bytes each and
    fail-fast). `.env` stays git-ignored.
  - _Requirements: 5.2 · Design: "Configuration"_

- [ ] 10. Unit tests (Vitest; fixed test keys, no real secrets)
  - `crypto/crypto.spec.ts`: round-trip (ASCII/Unicode/long); randomized IV
    (`encrypt(x) !== encrypt(x)`, both decrypt to `x`); envelope shape (IV 12,
    tag 16, `v1:` prefix); tamper detection (flipped ciphertext/tag, `v2:` prefix
    → throw); null preservation; blind-index determinism + case-insensitivity;
    key validation throws on missing/wrong length.
  - Update `users.service.spec.ts` / `auth.service.spec.ts`: lookups go through
    `{ emailBidx }`; `create` sets `emailBidx`; case-insensitive duplicate → 409.
  - _Requirements: 3.2, 3.3, 4.4, 4.5, 9.3 · Design: "Testing strategy" (unit)_

- [ ] 11. E2E tests (Vitest + supertest; real Postgres)
  - `test/*.e2e-spec.ts`: register→login happy path; `User@Example.com` then
    `user@example.com` → 409 via `uq_users_email_bidx`; capture→confirm a
    transaction then `GET /transactions` returns plaintext `description`; chat
    turn then `GET /conversations/:id/messages` returns plaintext `content`;
    at-rest assertion via raw `SELECT` that stored `email`/`display_name`/
    `description`/`content` match the `v1:…` envelope and contain no plaintext,
    and `email_bidx` equals the expected HMAC.
  - _Requirements: 1.2, 2.3, 4.5, 7.3, 9.3 · Design: "Testing strategy" (e2e)_

- [ ] 12. Verify build, lint, format, tests, and migration round-trip
  - Run `pnpm --dir backend lint`, `format:check`, `build`, `test`; fix issues.
    Recreate the dev schema (`DROP SCHEMA public CASCADE; CREATE SCHEMA public;`
    — authorized for the disposable dev DB), `migration:run`, `migration:show`
    `[X]`, then `migration:revert` round-trip and `migration:run` again. Run
    `pnpm --dir backend test:e2e` against the recreated DB. If the DB is
    unavailable, note it: unit tests gate the crypto + lookup logic; e2e +
    migration run where the DB exists.
  - _Requirements: 9.2, 9.3 · Design: "Verification"_

## Notes
- No new runtime dependency (`node:crypto`). No frontend change.
- Key rotation/versioning is out of scope (single key each; `v1:` reserved for
  forward-compat). `password` (bcrypt) and the session token (SHA-256) are not
  encrypted. No SQL search over encrypted fields; app-code matching only
  (the agent's duplicate-concept check keeps working over decrypted descriptions).
- Do not introduce `getRawOne/getRawMany`/raw SQL reads on encrypted columns
  (bypasses the transformer → exposes ciphertext).
- The `requirements.md` for this spec is PM-owned and, at authoring time, could
  not be written due to an environment permission rule on
  `.kiro/specs/**/requirements.md`; the content is drafted (see the design's
  Status note). Implementation does not depend on that file being persisted.

Depends on: `data-model-and-persistence` (implemented), `user-authentication`
(implemented), `conversational-agent-backend` (implemented).
