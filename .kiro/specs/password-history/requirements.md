# Requirements — Password History (no reuse of past passwords)

## Overview
Prevent users from reusing a recent past password. Finlux keeps a per-user
**password history** and, whenever a user sets a password, rejects a new
password that matches any of the user's recent passwords (including the current
one). This is a cross-cutting security feature for a finance application: it
applies to every place a password is established — today **registration** and
**password reset** — and to any future authenticated "change password" flow.

The history stores only **bcrypt hashes** of past passwords (never plaintext),
consistent with how credentials are already handled (`user-authentication`).
Comparison is done with bcrypt-compare against the stored hashes.

This is an additive **security/persistence** feature. It does not change the
authentication mechanism, the JWT/session model, or the reset-token flow; it
adds a reuse check at the point a password is set and the storage to support it.

## Terminology
- **User**: a login identity, per `user-authentication`. Not a financial account.
- **Current password**: the password hash currently stored on `users.password`.
- **Password history**: the set of a user's previously-used password hashes,
  retained up to a configured depth.
- **History depth (N)**: how many recent passwords are remembered and checked
  against. **N = 5** (the current password plus the four most recent prior
  passwords), configurable.
- **Set-password event**: any operation that establishes a user's password —
  registration (initial set), password reset (`password-reset` confirm), and any
  future in-session change.
- **Reuse**: a candidate new password whose bcrypt-compare matches any hash in
  the user's effective history (the last N, including the current password).

## Dependencies (consumed, not redefined here)
Builds additively on already-implemented specs:
- `user-authentication` — registration, the bcrypt `HashingService`, the
  password policy, and `users.password` (the current hash). The reuse check runs
  alongside the existing policy validation.
- `data-model-and-persistence` — the `users` table, user-scoped persistence,
  TypeORM + versioned migrations conventions.
- `password-reset` — the reset confirm step where a new password is set; this
  feature adds the reuse check to that step and populates history on reset.

## Scope
In scope:
- A **password-history store** (per user) holding bcrypt hashes of past
  passwords with a timestamp, retained up to depth N.
- A **reuse rule** applied on every set-password event: reject a new password
  that matches (bcrypt-compare) any of the user's last N passwords, including the
  current one.
- **Populating** the history: an entry is recorded at registration (the initial
  password) and on each successful password reset (the new password), so the
  history is complete from account creation onward.
- **Pruning**: keeping only the most recent N entries per user (older entries
  beyond N may be discarded).
- Integrating the rule into the `password-reset` confirm flow with a clear,
  user-facing error when reuse is detected (post-token step only — see
  Requirement 5 on disclosure).
- Configuration (by key name, documented in `.env.example`) for N; security
  baseline (only bcrypt hashes stored; nothing logged in plaintext).

Out of scope:
- Any change to the authentication mechanism, the JWT/session model, or the
  reset-token lifecycle (`user-authentication`, `password-reset`).
- Password **expiry/rotation policies** (forcing periodic changes) — this is
  reuse prevention only, not mandatory rotation.
- An authenticated in-session "change password" UI/endpoint — not built yet; when
  it exists it SHALL reuse this feature's rule (noted for forward-compat).
- Similarity/fuzzy checks (e.g. "too close to a previous password"); this feature
  matches exact passwords via bcrypt-compare, not near-matches.
- Breached-password / have-i-been-pwned checks (possible later spec).
- Any frontend change beyond surfacing the reuse error already returned by the
  reset confirm endpoint (the `password-reset` frontend renders the backend's
  generic/validation error; this feature only adds the reuse case to it).
- Any real-money movement or regulated advice (product non-goals, unaffected).

## Requirements

### Requirement 1 — Password-history store
**User story:** As the product owner, I want past passwords remembered securely,
so that reuse can be detected without storing plaintext.

Acceptance criteria (EARS):
1. THE SYSTEM SHALL persist a per-user password history, each entry owning a
   bcrypt **hash** of a past password, the owning user, and a creation
   timestamp; it SHALL NOT store plaintext passwords.
2. THE history SHALL be scoped per user via a foreign key to `users` with
   `ON DELETE CASCADE`, consistent with the other user-owned tables.
3. THE SYSTEM SHALL manage the schema change through a versioned migration and
   SHALL use parameterized access via TypeORM (no string-interpolated queries).

### Requirement 2 — Record history on every set-password event
**User story:** As the system, I want the history populated wherever a password
is set, so that the reuse check is accurate from account creation onward.

Acceptance criteria (EARS):
1. WHEN a user registers, THE SYSTEM SHALL record the initial password's hash as
   the first history entry for that user.
2. WHEN a user successfully resets their password (`password-reset` confirm),
   THE SYSTEM SHALL record the new password's hash as a history entry.
3. WHERE a future in-session "change password" flow sets a password, THE SYSTEM
   SHALL record that password's hash as a history entry (forward-compat; the
   same mechanism SHALL be reused).
4. THE SYSTEM SHALL keep at most N entries per user, pruning older entries beyond
   the configured depth.

### Requirement 3 — Reuse rejection rule
**User story:** As a user, I want to be stopped from reusing a recent password,
so that a reset meaningfully changes my credentials.

Acceptance criteria (EARS):
1. WHEN a password is set, THE SYSTEM SHALL compare the candidate new password
   (via bcrypt-compare) against the user's effective history: the current
   password plus the most recent prior passwords, up to depth N.
2. IF the candidate matches any entry in that effective history, THEN THE SYSTEM
   SHALL reject it as a reused password and SHALL NOT change the stored password
   or add a history entry.
3. THE reuse check SHALL run together with the existing password-policy
   validation; a candidate SHALL satisfy BOTH the policy AND the no-reuse rule
   to be accepted.
4. THE SYSTEM SHALL treat the comparison as exact-match-only (bcrypt-compare of
   the plaintext against each stored hash); it SHALL NOT attempt similarity or
   fuzzy matching.

### Requirement 4 — History depth configuration
**User story:** As an operator, I want the history depth configurable, so that
the policy can be tuned without code changes.

Acceptance criteria (EARS):
1. THE SYSTEM SHALL read the history depth **N** from configuration by key name,
   documented in `backend/.env.example`, defaulting to **5** when unset.
2. THE effective history checked against SHALL be the current password plus the
   prior passwords up to N total (so a user cannot set a new password equal to
   any of the last N, including the one in use).

### Requirement 5 — Reset integration and user-facing message
**User story:** As a user resetting my password, I want a clear reason when my
new password is rejected for reuse, so that I can choose a different one.

Acceptance criteria (EARS):
1. WHEN the `password-reset` confirm step receives a valid reset token AND a new
   password that is rejected for reuse, THE SYSTEM SHALL reject the request with
   `400 Bad Request` and SHALL NOT change the password.
2. THE reset confirm SHALL surface a clear, user-facing reason for a reuse
   rejection (e.g. "You've used this password before — please choose a new
   one"), distinct from the generic invalid-token message, SO THAT the user
   understands how to proceed. This explicit message is allowed ONLY at the
   confirm step, which already requires a valid reset token proving control of
   the account; it does NOT weaken the request step's non-disclosure
   (Requirement 2 of `password-reset`), which SHALL remain unchanged.
3. THE SYSTEM SHALL keep the invalid/expired/used-token conditions
   indistinguishable from each other as before; only the **reuse** case (reached
   after a valid token) gets its own clear message.

### Requirement 6 — Security and non-disclosure baseline
**User story:** As a user, I want this feature to not leak my credential history,
so that it strengthens rather than weakens security.

Acceptance criteria (EARS):
1. THE SYSTEM SHALL store only bcrypt hashes in the history and SHALL NOT log
   plaintext passwords, password hashes, or the fact of a specific prior
   password's value.
2. THE SYSTEM SHALL NOT expose the password history, its size, or any past hash
   through any API response.
3. THE SYSTEM SHALL NOT include stack traces, SQL, or internal details in error
   responses; the reuse rejection is a generic-but-clear `400` validation-style
   message with no sensitive detail.
4. THE password-history check SHALL NOT be reachable without the normal
   authorization for the set-password event it guards (e.g. a valid reset token
   for reset), so it cannot be used to probe a user's past passwords.

### Requirement 7 — Stack alignment and quality
**User story:** As a developer, I want the feature to fit the project's stack and
pass its checks.

Acceptance criteria (EARS):
1. THE implementation SHALL align with `.kiro/steering/tech.md` (NestJS, TypeORM,
   ESM with `.js` import specifiers, PostgreSQL) and live under `backend/src/`.
2. THE implementation SHALL pass `pnpm --dir backend lint`,
   `pnpm --dir backend format:check`, `pnpm --dir backend build`, and
   `pnpm --dir backend test`.
3. THE implementation SHALL include automated tests covering: history recorded at
   registration and on reset; the last-N window is enforced (the current password
   and the most recent prior passwords are rejected; a password older than N is
   accepted again); the reuse rejection returns `400` and changes nothing; the
   reuse message is distinct from the invalid-token message at confirm; and only
   bcrypt hashes (never plaintext) are stored. Hashing/bcrypt SHALL be exercised
   deterministically without real secrets.

## Open questions / decisions for design
Flagged for the Tech Lead / Solution Architect to resolve in `design.md`; the
requirements above are intentionally agnostic to them:
- **Table shape**: a dedicated `password_history` table (columns: `id`,
  `user_id` FK cascade, `password_hash`, `created_at`; index on
  `(user_id, created_at)`) vs an alternative; naming per the project's migration
  convention (`pk_`/`fk_`/`idx_`). Whether the current `users.password` is
  mirrored into history or treated as an implicit "current" compared separately.
- **Pruning strategy**: delete-older-than-N on each insert vs a periodic prune;
  how to keep the window exact under concurrency.
- **Where the shared check lives**: a `PasswordHistoryService` injected by the
  auth/register and password-reset flows, so registration and reset (and a future
  change-password) all go through one rule.
- **Comparison cost**: up to N bcrypt-compares per set-password event; confirm
  this is acceptable or whether to short-circuit.
- **Config key name/default**: e.g. `PASSWORD_HISTORY_DEPTH=5`.
- **Interaction with `password-reset` tasks**: this feature adds a step to the
  reset confirm (and to registration); the design coordinates the additive change
  to the already-implemented `password-reset` and `user-authentication` flows
  without changing their contracts beyond the new reuse `400`.

## Status
- Requirements: drafted (PM), ready for review.
- Design (`design.md`): not started — pending Tech Lead (architecture), informed
  by the Solution Architect.
- Tasks (`tasks.md`): not started — pending design.

Depends on: `user-authentication` (implemented — bcrypt hashing, password policy,
`users.password`), `data-model-and-persistence` (implemented — `users`,
migrations), `password-reset` (implemented — the reset confirm step this feature
guards and populates history from).
