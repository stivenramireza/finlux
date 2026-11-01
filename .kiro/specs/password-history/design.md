# Design — Password History (no reuse of past passwords)

> Authored by the Tech Lead, folding the Solution Architect's analysis (orders of
> operations, table/current-password/pruning, service placement, register
> seeding, and the risk list). Authoritative for implementation; the Backend
> Engineer implements against it. Requirements (`requirements.md`) are PM-owned
> and unchanged.

## Goal
Prevent reuse of a recent past password. Finlux keeps a per-user
`password_history` of **bcrypt hashes only** (never plaintext) and, on every
set-password event, rejects a new password that matches (bcrypt-compare) any of
the user's last **N = 5** passwords (the current one plus the four most recent
prior). Applies today to **registration** and **password reset**, and is built so
a future authenticated "change password" flow reuses the same rule. Backend-only
(NestJS 12, TypeORM, ESM `.js` specifiers, PostgreSQL); additive on
`user-authentication`, `data-model-and-persistence`, and `password-reset`.

## Tech context (verified)
- `password-reset.service.ts` `confirm(rawToken, newPassword)` today: validates
  the token, **consumes it atomically** (`UPDATE … SET used_at=now() WHERE
  id=:id AND used_at IS NULL`, checks `affected>=1`), then `hash()` +
  `usersService.updatePassword()`. Password policy is enforced by the DTO via the
  global `ValidationPipe`.
- `auth.service.ts` `register()`: pre-checks the duplicate email, `hash()`s, calls
  `usersService.create(...)`, and maps a unique-violation (SQLSTATE 23505) to
  `409`.
- `hashing.service.ts`: `hash(plain)` / `compare(plain, hash)` (bcrypt cost
  `BCRYPT_SALT_ROUNDS`, default 12). Provided **by value** in both `AuthModule`
  and `PasswordResetModule`.
- `users.service.ts`: `create(dto)`, `updatePassword(id, hash)`; `users.password`
  is `select:false`. `sessions` stores a SHA-256 of the JWT; `password_reset_tokens`
  stores only a token hash. Latest migration: `1730000004000`.

## Resolved decisions

### Decision 1 — `confirm`: reuse-check BEFORE consuming the token
Moving the reuse-check (a side-effect-free read + bcrypt-compare) before the
single-use consume avoids burning the token on a reuse rejection (Req 2.1/3.2:
reuse must not change the password or add history — and should not waste the
token). The **atomic consume stays the real commit barrier**, so single-use
remains race-safe. Order for `confirm(rawToken, newPassword)`:
1. `tokenHash = sha256(rawToken)`; `findOne({ tokenHash })`.
2. Read-only validity check (does **not** consume): `!token || usedAt !== null ||
   expiresAt <= now` → generic `400` (unchanged; keeps token conditions
   indistinguishable, `password-reset` Req 4.4/5.3).
3. **Reuse-check before consuming**: `passwordHistory.assertNotReused(token.userId,
   newPassword)`. On reuse → `400` with the **distinct reuse message** (Req 5.2);
   the token stays live so the user retries another password on the same link.
   (Policy `400` already happens earlier via the DTO/ValidationPipe.)
4. **Atomic consume**: `UPDATE … SET used_at=now() WHERE id=:id AND used_at IS
   NULL`; `affected<1` → generic `400`. This is the serialization point — only
   one caller wins.
5. `passwordHash = hash(newPassword)`.
6. **In one transaction**: `usersService.updatePassword(userId, hash, manager)` +
   `passwordHistory.record(userId, hash, manager)` (insert + prune).

Race analysis: the reuse-check has no side effects, so running it concurrently is
harmless; the only irreversible effect (changing the password) stays behind the
`affected>=1` barrier. Worst case under the race is a redundant bcrypt-compare on
the loser.

Documented trade-off (**reuse oracle**): while a valid token is live (≤5 min, one
per account), a holder can probe "have I used this?" repeatedly. Authorized by
Req 5.2/6.4 — a valid-token holder already controls the account; it reveals only
match/no-match against ≤5 bcrypt hashes, never a hash or a plaintext. Accepted for
this version (re-issuing a fresh token on reuse was considered and rejected as
needless complexity).

### Decision 2 — Current password lives as a history row (single source for N)
Each set-password event **inserts** the new hash into `password_history`, and the
effective N-window is read **only** from `password_history`
(`ORDER BY created_at DESC LIMIT N`) — no separate compare against
`users.password`. Rationale:
- Uniform N (Req 4.2 "current + prior up to N total"): `LIMIT N` already includes
  the current one; no special "+1".
- Avoids a second `select:false` read of `users.password` on every event.
- Consistency/concurrency: one store, one write per event (insert + prune) in the
  **same transaction** as `updatePassword`, so `users.password` and the newest
  history row are written atomically together.

Trade-off (accepted): the current hash is duplicated in `users.password` and the
newest history row — cheap (one varchar), bought for consistency.

### Decision 3 — Table shape & pruning
Table `password_history` (snake_case plural), per the project's naming
convention:

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` PK | `gen_random_uuid()` (`pk_password_history`) |
| `user_id` | `uuid` NOT NULL FK → `users.id` | `ON DELETE CASCADE` (`fk_password_history_user`) |
| `password_hash` | `varchar` NOT NULL | bcrypt hash, never plaintext (Req 1.1/6.1); **not** `select:false` (not API-exposed, Req 6.2; the service reads it) |
| `created_at` | `timestamptz` | `@CreateDateColumn` (rows immutable — no `updated_at`) |

Index `idx_password_history_user_id_created_at` on `(user_id, created_at)` — serves
both the `ORDER BY created_at DESC LIMIT N` read and the prune. Migration
`1730000005000-CreatePasswordHistoryTable.ts` (after `1730000004000`), registered
in **both** `data-source.ts` and `database.module.ts`; `down()` drops the index
then the table.

**Pruning: delete-on-insert** (not periodic), inside the set-password
transaction, keeping the N most recent:
```sql
DELETE FROM password_history
WHERE user_id = :userId
  AND id NOT IN (
    SELECT id FROM password_history
    WHERE user_id = :userId
    ORDER BY created_at DESC
    LIMIT :n
  );
```
Insert-time keeps the invariant "≤N rows per user" exact after every event
(a periodic prune would transiently keep >N and make the window clock-dependent).

### Decision 4 — Shared rule in its own module (no cycles)
`PasswordHistoryModule` owns the entity
(`TypeOrmModule.forFeature([PasswordHistory])`) and exports a
`PasswordHistoryService`:
- `assertNotReused(userId, plaintext): Promise<void>` — reads the N most recent
  (`ORDER BY created_at DESC LIMIT N`), bcrypt-compares with **short-circuit**
  (stop at the first match), comparing the **current (most recent) first**; on a
  match throws `BadRequestException` with the reuse message (Req 5.2/3.2).
- `record(userId, hash, manager?): Promise<void>` — insert + prune; accepts an
  optional `EntityManager` to join the caller's transaction (Decision 1 step 6,
  Decision 5).

Dependency hygiene: `PasswordHistoryService` injects only its repository,
`HashingService` (for `compare`), and `ConfigService` (for N). It does **not**
inject `UsersService` (not needed — the current password is in history,
Decision 2), so no cycle with `users`. `AuthModule → PasswordHistoryModule` and
`PasswordResetModule → PasswordHistoryModule` are one-directional; the existing
`AuthModule → PasswordResetModule → UsersModule` graph stays acyclic.

`HashingService` is currently provided by value in two modules. Preferred:
extract a small exportable `HashingModule` and import it where needed (auth,
password-reset, password-history), removing the triplicated provider. Acceptable
fallback: provide `HashingService` by value in `PasswordHistoryModule` too. Either
keeps the graph acyclic.

### Decision 5 — Register seeding (atomic user + first history row)
In register the reuse-check is a no-op (empty history), but the first row must be
seeded (Req 2.1) **without** breaking the existing `23505 → 409` mapping. Order
for `register`:
1. normalize email, duplicate pre-check (`409`) — unchanged.
2. `passwordHash = hash(dto.password)`.
3. `dataSource.transaction(manager => { user = usersService.create(dto, manager);
   passwordHistory.record(user.id, passwordHash, manager); })` — atomic
   user + first history row.
4. `catch`: `23505 → ConflictException(409)` wrapping the whole transaction (on a
   unique violation the tx rolls back — no orphan history — same contract as
   today).
5. `toPublicUser`.

This needs an **additive** `manager?: EntityManager` parameter on
`UsersService.create` (and `updatePassword` for Decision 1 step 6). No contract
change beyond the new reuse `400`.

## Configuration (`.env.example`, names only where applicable)
```
# --- Password history (no-reuse rule) ---
PASSWORD_HISTORY_DEPTH=5   # How many recent passwords (incl. the current one) are remembered/checked. Default 5; clamped to >= 1.
```
Read via `ConfigService`; the service clamps `N >= 1`.

## Module / file structure
```
backend/src/password-history/                 # NEW
├── password-history.module.ts
├── password-history.service.ts               # assertNotReused + record (insert + prune)
├── password-history.service.spec.ts
└── entities/password-history.entity.ts
backend/src/auth/hashing/hashing.module.ts    # NEW (optional) — export HashingService
backend/src/database/migrations/
└── 1730000005000-CreatePasswordHistoryTable.ts  # NEW (registered in both files)
backend/src/auth/auth.service.ts              # MODIFIED — seed history in register (tx)
backend/src/auth/auth.module.ts               # MODIFIED — import PasswordHistoryModule (+ HashingModule)
backend/src/auth/password-reset/password-reset.service.ts  # MODIFIED — reuse-check before consume; record on confirm
backend/src/auth/password-reset/password-reset.module.ts   # MODIFIED — import PasswordHistoryModule
backend/src/users/users.service.ts            # MODIFIED — create/updatePassword accept optional EntityManager
backend/.env.example                          # MODIFIED — PASSWORD_HISTORY_DEPTH
```

## Security & non-disclosure
- Only bcrypt hashes stored; never log plaintext, hashes, or a specific prior
  value (Req 6.1). History size/contents never exposed via any API (Req 6.2).
- The reuse rejection is a clear-but-generic `400` with no internal detail
  (Req 6.3); it is reachable only after the set-password event's normal
  authorization (valid reset token for reset; register itself) (Req 6.4).
- The reuse message is distinct from the invalid-token message, but only at the
  confirm step (post valid token); the invalid/expired/used token conditions stay
  indistinguishable (Req 5.2/5.3).

## Testing strategy (Req 7.3)
Deterministic, bcrypt exercised with small/test cost (no real secrets):
- **Unit** (`password-history.service.spec.ts`, mocked repo + real/mocked
  `HashingService`): `record` inserts then prunes to N; `assertNotReused` rejects
  when the candidate matches the current or a recent prior within N, accepts a
  password older than N (fell out of the window), short-circuits at the first
  match, and compares the current first; `N` clamps to ≥1.
- **Register** (`auth.service.spec.ts`): a first history row is recorded on
  successful register; a `23505` still maps to `409` and leaves no orphan history
  (tx rollback).
- **Reset confirm** (`password-reset.service.spec.ts`): a reused new password →
  `400` with the **reuse** message, token **not** consumed, password unchanged,
  no history added; a fresh valid new password → consumes the token, updates the
  password, and records history; the invalid/expired/used-token message stays
  generic and distinct from the reuse message.
- **E2E** (extend `test/password-reset.e2e-spec.ts` or a new
  `test/password-history.e2e-spec.ts`, real Postgres): register → reset to a new
  password → attempt to reset back to the original (or the just-set) password →
  `400` reuse; reset to a genuinely new password succeeds; after N+1 distinct
  resets, the oldest password becomes reusable again (window of N). Assert the DB
  stores hashes, never plaintext.
- Gates: `pnpm --dir backend lint`/`format:check`/`build`/`test`; `test:e2e` +
  migration round-trip where a DB is reachable.

## Verification
- Backend gates green (Req 7.2).
- `migration:run` creates `password_history`; `migration:revert` rolls back
  cleanly; `migration:show` lists it applied.
- Manual: resetting to a recent password is rejected with the reuse message and
  the token survives for a retry; resetting to a new password succeeds and the old
  no longer works; a password beyond the N-window is accepted again.

## Notes to the Product Manager (requirements.md unchanged)
1. **Reuse oracle at confirm** (Decision 1): a valid live reset token allows
   repeated "have I used this?" probing for ≤5 min. This is the trade-off Req 5.2
   already authorizes (post-token only); it reveals only match/no-match against
   ≤5 hashes, no plaintext/hash. Flagged so it is a conscious acceptance.
2. **Register DoS profile unchanged**: register adds **zero** bcrypt-compares (empty
   history → no-op reuse-check), so this feature does not worsen register's cost.
   The N compares only occur on reset (behind token + cooldown) and a future
   change-password (behind the JWT guard).

## Status
- Requirements: PM-owned (drafted).
- Design: **complete (Tech Lead)**, folding the Solution Architect's analysis.
- Tasks (`tasks.md`): **implemented and verified (all 10).** Backend gates green
  (`lint`/`format:check`/`build`/`test`, 184 unit); DB-verified on live
  Postgres 18.1 (migration `1730000005000` run/show/revert/re-run round-trip;
  `test:e2e` 44 across 6 files, incl. 6 new password-history and password-reset
  intact). `HashingModule` extracted. No deviations.

Depends on: `user-authentication`, `data-model-and-persistence`, `password-reset`
(all implemented).
