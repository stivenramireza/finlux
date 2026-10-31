# Requirements — PII Encryption at Rest

## Overview
Finlux is a personal-finance assistant, so the most sensitive user data must be
protected **at rest** in the database. This spec adds **application-level,
transparent encryption** of specific PII fields: the stored database column
holds ciphertext, while the application (services, controllers, the agent) keeps
reading and writing plaintext. It also replaces the plaintext, uniquely-indexed
email with an **encrypted email plus a deterministic blind index** so login and
uniqueness still work without storing the email in the clear.

This is an additive **security/persistence** feature. It does not add new product
behavior; it changes how four existing fields are stored and how a user is found
by email.

## Terminology
- **Encrypted field**: a column whose value is stored as ciphertext and
  decrypted transparently when the application reads the row.
- **At rest**: the data as persisted in the database (and any DB backup/dump).
- **Authenticated encryption**: a cipher providing confidentiality and integrity
  (tampering is detectable). Finlux uses AES-256-GCM.
- **IV (initialization vector)**: a per-value random nonce so equal plaintext
  encrypts to different ciphertext each time.
- **Ciphertext envelope**: the single stored string bundling version tag, IV,
  authentication tag, and ciphertext.
- **Blind index (`email_bidx`)**: a deterministic, keyed value (HMAC) derived
  from the **normalized** email, used to look up a user by email and to enforce
  uniqueness — without storing the plaintext email.
- **Normalized email**: the email trimmed and lowercased (matching the existing
  auth normalization), so matching is case-insensitive.
- **Encryption key / blind-index key**: two **separate** secrets read from the
  environment; one for AES-256-GCM, one for the HMAC blind index.

## Fields in scope (encrypted at rest)
- `users.email`
- `users.display_name`
- `messages.content` (both the **user's** and the **agent's** messages)
- `transactions.description`

## Dependencies (consumed, not redefined here)
Builds additively on already-implemented specs:
- `data-model-and-persistence` — the `users`/`transactions` tables and entities.
- `user-authentication` — registration/login, email normalization, duplicate 409.
- `conversational-agent-backend` — the `messages` table and the agent's
  "duplicate concept in the same month" behavior over transaction descriptions.

## Scope
In scope:
- Encrypting the four fields above at rest, transparently to callers.
- Replacing the plaintext unique email with an encrypted `email` column (kept for
  display/return) plus a deterministic `email_bidx` used for login lookups and
  uniqueness.
- Reading encryption and blind-index keys from the environment by key name, with
  fail-fast validation at startup.
- Ensuring no plaintext of these fields — and no keys or ciphertext envelopes —
  is logged.
- Automated, deterministic tests that do not require real secrets.

Out of scope:
- **Key rotation / key versioning** (a single key of each type; the envelope may
  reserve a version tag for forward-compat, but rotation is not implemented).
- Encrypting the password (already a bcrypt hash) or the session token (already a
  SHA-256 hash).
- Any SQL-side search/filter/sort over encrypted fields (see Requirement 7).
- Any frontend change.
- Changing the auth token: the JWT may still carry the email as today (a token
  concern, not storage-at-rest), and is out of scope here.

## Requirements

### Requirement 1 — Sensitive fields encrypted at rest
**User story:** As a user, I want my most sensitive data stored encrypted, so
that a database compromise does not expose it in the clear.

Acceptance criteria (EARS):
1. THE SYSTEM SHALL store `users.email`, `users.display_name`,
   `messages.content`, and `transactions.description` as ciphertext at rest.
2. THE SYSTEM SHALL NOT store the plaintext of any field in scope at rest.
3. WHERE a field in scope is nullable and the value is null, THE SYSTEM SHALL
   store null (it SHALL NOT encrypt or fabricate a value for null).

### Requirement 2 — Transparent encryption/decryption
**User story:** As a developer, I want encryption to be transparent, so that
existing services, APIs, and the agent keep working with plaintext.

Acceptance criteria (EARS):
1. WHEN the application writes a record with a field in scope, THE SYSTEM SHALL
   encrypt the value before it is persisted.
2. WHEN the application reads a record with a field in scope, THE SYSTEM SHALL
   return the decrypted plaintext to the caller.
3. THE SYSTEM SHALL preserve the existing request/response contracts of the
   users, transactions, and chat surfaces (callers send and receive plaintext),
   with no ciphertext ever returned through the API.

### Requirement 3 — Authenticated encryption with per-value IV
**User story:** As the product owner, I want strong, tamper-evident encryption,
so that stored data is both confidential and integrity-protected.

Acceptance criteria (EARS):
1. THE SYSTEM SHALL use authenticated encryption (AES-256-GCM) with a fresh
   random IV per encrypted value.
2. THE SYSTEM SHALL ensure equal plaintext values are **not** distinguishable by
   their stored ciphertext (randomized encryption).
3. IF a stored ciphertext value has been tampered with (altered ciphertext or
   authentication tag), THEN THE SYSTEM SHALL detect it and fail the decryption
   rather than return corrupted or attacker-controlled plaintext.

### Requirement 4 — Email encryption with a deterministic blind index
**User story:** As a registered user, I want to log in with my email even though
it is stored encrypted, and I want duplicate emails rejected.

Acceptance criteria (EARS):
1. THE SYSTEM SHALL keep the `email` column (same name) storing the **encrypted**
   email for display/return, and SHALL NOT store the plaintext email at rest.
2. THE SYSTEM SHALL maintain a deterministic `email_bidx` (a keyed HMAC over the
   normalized email) and SHALL use it to look up a user by email (registration
   duplicate check and login).
3. THE SYSTEM SHALL enforce email uniqueness via `email_bidx` (a unique index),
   not via the encrypted `email` column.
4. THE SYSTEM SHALL normalize the email (trim + lowercase) before computing the
   blind index, so matching and uniqueness are case-insensitive.
5. WHEN a registration uses an email that already exists (in any letter case),
   THE SYSTEM SHALL reject it as a duplicate with a conflict error (409),
   consistent with `user-authentication`.
6. THE SYSTEM SHALL resolve the current user for login via the blind index and
   return the generic 401 on failure (no disclosure), unchanged from
   `user-authentication`.

### Requirement 5 — Key management and fail-fast configuration
**User story:** As an operator, I want keys configured safely, so that
misconfiguration fails loudly rather than silently weakening security.

Acceptance criteria (EARS):
1. THE SYSTEM SHALL use two **separate** secret keys: one for AES-256-GCM
   encryption and one for the email blind index (HMAC).
2. THE SYSTEM SHALL read both keys from the environment by key name, and SHALL
   document them in `backend/.env.example` with no real values; `.env` stays
   git-ignored and values are never committed.
3. IF a required key is missing or is not the expected length, THEN THE SYSTEM
   SHALL fail fast at startup with a clear error and SHALL NOT start serving.
4. THE SYSTEM SHALL NOT hard-code any key or derive both from a single secret.

### Requirement 6 — Non-disclosure (no plaintext/keys/ciphertext in logs)
**User story:** As a user, I want certainty that my data is not leaked through
logs, so that encryption at rest is not undermined elsewhere.

Acceptance criteria (EARS):
1. THE SYSTEM SHALL NOT log the plaintext of any field in scope.
2. THE SYSTEM SHALL NOT log the encryption or blind-index keys, nor the
   ciphertext envelopes.
3. THE SYSTEM SHALL treat all four fields as sensitive PII consistent with the
   project security baseline.

### Requirement 7 — Accepted limitation: no SQL search over encrypted data
**User story:** As a developer, I want the limitations of encryption-at-rest to
be explicit, so that no feature silently relies on searching encrypted data.

Acceptance criteria (EARS):
1. THE SYSTEM SHALL NOT filter, sort, or search encrypted fields in SQL (their
   stored form is opaque ciphertext).
2. WHERE matching over an encrypted field is required, THE SYSTEM SHALL perform
   it in application code over decrypted values.
3. THE SYSTEM SHALL preserve the existing agent behavior that checks for a
   "duplicate concept in the same month" by listing the month's transactions
   (filtered by non-encrypted fields) and comparing **decrypted** descriptions in
   application code — this SHALL continue to work after encryption.

### Requirement 8 — Persistence, integrity, and migrations
**User story:** As a developer, I want the schema change managed properly and
safely.

Acceptance criteria (EARS):
1. THE SYSTEM SHALL manage the schema change through versioned migrations,
   consistent with the project's migration convention.
2. THE SYSTEM SHALL provide a database-level unique index on `email_bidx`.
3. THE SYSTEM SHALL use parameterized access via TypeORM (no string-interpolated
   queries), consistent with the security baseline.
4. THE ciphertext columns SHALL be typed to hold the ciphertext envelope without
   truncation.

### Requirement 9 — Stack alignment and quality
**User story:** As a developer, I want the feature to fit the project's stack and
pass its checks.

Acceptance criteria (EARS):
1. THE implementation SHALL align with `.kiro/steering/tech.md` (NestJS backend,
   TypeORM, ESM with `.js` import specifiers, PostgreSQL) and live under
   `backend/src/`.
2. THE implementation SHALL pass `pnpm --dir backend lint`,
   `pnpm --dir backend format:check`, `pnpm --dir backend build`, and
   `pnpm --dir backend test`.
3. THE SYSTEM SHALL include automated tests that are deterministic and do not
   require real secrets, covering: encrypt→decrypt round-trip; tamper detection;
   randomized ciphertext (equal plaintext → different stored values); blind-index
   determinism and case-insensitive duplicate rejection; and that no plaintext of
   the fields in scope is stored at rest.

## Status
- Requirements: drafted (PM).
- Design (`design.md`): complete (Tech Lead), folding the Solution Architect's
  technical design.
- Tasks (`tasks.md`): written (Tech Lead) against the design.

Depends on: `data-model-and-persistence` (implemented), `user-authentication`
(implemented), `conversational-agent-backend` (implemented). Three existing specs
carry cross-reference notes pointing here.
