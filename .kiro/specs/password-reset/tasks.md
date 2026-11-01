# Tasks — Password Reset (forgot password)

Implementation plan. Backend (`backend/`, NestJS 12 + TypeORM, ESM `.js`
specifiers) and frontend (`frontend/`, Next.js App Router). Additive on
`user-authentication`, `pii-encryption-at-rest`, `data-model-and-persistence`,
`frontend-auth-integration` (all implemented). Introduces Finlux's **first
outbound-email capability** via **Resend**. No change to login/registration or
the JWT/session mechanism.

> Authored by the Tech Lead; persisted by the PM on the Tech Lead's behalf (no
> write tool in the Tech Lead role in this environment). Implementation is
> delegated to the Backend/Frontend Engineers. `.kiro/specs/**` checkboxes are
> marked by the Tech Lead/PM since engineers are read-only on specs.

Prefer `package.json` scripts: `pnpm --dir backend lint`,
`pnpm --dir backend format:check`, `pnpm --dir backend build`,
`pnpm --dir backend test`, `pnpm --dir backend test:e2e`,
`pnpm --dir backend migration:run` / `migration:revert` / `migration:show`;
`pnpm --dir frontend lint`, `pnpm --dir frontend build`.

## Backend

- [x] 1. Add and pin the Resend dependency + mailer configuration keys
  - Add `"resend": "6.37.0"` (exact pin) to `backend/package.json`
    `dependencies`; install via pnpm under Node 24.22.1.
  - Document in `backend/.env.example` (names only for secrets): `RESEND_API_KEY`,
    `RESEND_FROM` (default `Finlux <onboarding@resend.dev>` — Resend sandbox
    sender, used in dev+prod for now), `APP_BASE_URL` (default
    `http://localhost:3000`), `PASSWORD_RESET_TOKEN_TTL` (default `5m`),
    `PASSWORD_RESET_REQUEST_COOLDOWN` (default `60s`). Read via `ConfigService`
    by key name.
  - _Requirements: 8.1, 8.2, 10.1 · Design: Decisions 1, 3, 8, 10_

- [x] 2. Implement the mailer port + Resend adapter
  - `mail/mailer.port.ts`: `MailerPort` interface with
    `sendPasswordResetEmail({ to, resetUrl, locale })` and a DI token `MAILER`.
  - `mail/resend.mailer.ts`: `ResendMailer` implementing `MailerPort` with the
    `resend` client (reads `RESEND_API_KEY`/`RESEND_FROM`), plain `html` + `text`
    body, an explicit 5-minute expiry notice, and es/en copy by `locale`
    (default `es`). Never log the token or the recipient in a PII-creating way.
  - `mail/mail.module.ts`: provides/exports `MAILER`.
  - _Requirements: 1.4, 8.1, 8.3, 9.2, 10.1 · Design: Decisions 1, 10_

- [x] 3. Create the `PasswordResetToken` entity + migration
  - `auth/password-reset/entities/password-reset-token.entity.ts` (table
    `password_reset_tokens`): `id` uuid PK, `userId` (`user_id`) uuid NOT NULL FK
    → `users` (CASCADE), `tokenHash` (`token_hash`) varchar NOT NULL **unique**,
    `expiresAt` (`expires_at`) timestamptz NOT NULL, `usedAt` (`used_at`)
    timestamptz NULL, `createdAt`/`updatedAt`. Mirror the style of
    `session.entity.ts`.
  - `database/migrations/1730000004000-CreatePasswordResetTokenTable.ts`: create
    the table with `pk_password_reset_tokens`,
    `fk_password_reset_tokens_user` (CASCADE),
    `uq_password_reset_tokens_token_hash`, and index
    `idx_password_reset_tokens_user_id`; `down()` drops the index then the table.
    Mirror `1730000002000-CreateSessionTable.ts`.
  - Register the entity **and** migration in **both** `database/data-source.ts`
    and `database/database.module.ts` (entities + migrations arrays, `.js`
    imports).
  - _Requirements: 3.2, 9.4 · Design: Decision 2_

- [x] 4. Implement `PasswordResetService` (request + confirm)
  - `auth/password-reset/password-reset.service.ts`:
    - **request(email, locale)**: normalize + resolve the user via the
      `email_bidx` blind index (reuse `UsersService`/`CryptoService`). If no
      user, return (uniform response upstream) **without** creating a token or
      sending. If a user exists and no cooldown is active, in a **single
      transaction** invalidate outstanding tokens for that user and insert a new
      one: raw `randomBytes(32)` → base64url, store only
      `token_hash = sha256(raw)` + `expires_at = now + TTL(5m)`. Build the reset
      URL from `APP_BASE_URL` + `/reset-password?token=<raw>`. Dispatch the email
      **after** the HTTP response is committed (non-blocking) so timing does not
      disclose existence; log send failures internally without PII.
    - **confirm(token, password)**: `sha256(token)`, look up by `token_hash`,
      validate `used_at IS NULL AND expires_at > now()`. Atomically mark
      `used_at` (guard on affected rows), bcrypt-hash the new password via
      `HashingService`, update `users.password`. On any invalid/expired/used/
      unknown token → generic `400` (no oracle). No session issued.
  - Decrypt the recipient email only from the located row (`pii-encryption-at-rest`).
  - _Requirements: 1.2, 2.1, 2.2, 2.3, 3.1, 3.2, 3.3, 3.4, 3.5, 4.2, 4.4, 4.5, 5.1, 8.3, 8.4, 9.2 · Design: Decisions 2, 3, 4, 5, 6, 8_

- [x] 5. DTOs + controller routes
  - `auth/password-reset/dto/request-password-reset.dto.ts`: `email` (`@IsEmail`)
    + optional `locale`.
  - `auth/password-reset/dto/confirm-password-reset.dto.ts`: `token`
    (`@IsString`, `@IsNotEmpty`) + `password` reusing the **existing** policy
    decorators from `RegisterDto` (min 8, upper, lower, digit, special).
  - `auth.controller.ts`: add unauthenticated `POST /auth/password-reset/request`
    (always returns the uniform non-disclosing body, `200`/`202`) and
    `POST /auth/password-reset/confirm` (`200` success / generic `400`). Wire
    `PasswordResetModule` (provides the service, imports `MailModule`,
    `TypeOrmModule.forFeature([PasswordResetToken])`) and import it where
    `AuthModule` is composed.
  - _Requirements: 1.1, 1.3, 2.1, 4.1, 4.3, 9.1, 9.3 · Design: Decisions 5, 6, 9_

- [~] 6. Optional per-IP throttling on the request route
  - _Intentionally deferred (non-blocking per the design): `@nestjs/throttler`
    was not added to avoid a new unpinned dependency. The primary guard
    (DB-backed per-account cooldown + one-live-token cap, task 4) covers Req 9.5.
    Can be added later without touching the rest._
  - Apply `@nestjs/throttler` (or equivalent) to the request endpoint as
    defense-in-depth, without leaking account existence. Keep the per-account
    cooldown + single-live-token cap from task 4 as the primary guard.
  - _Requirements: 9.5 · Design: Decision 8_

- [x] 7. Backend unit + e2e tests (Resend mocked)
  - Unit (`password-reset.service.spec.ts`, fake mailer + mocked repo/crypto):
    non-existent email → uniform response, **no token, mailer not called**;
    existing → one hashed 5-min single-use token + one send; re-request supersedes
    prior (≤1 live); confirm valid → password updated + `used_at` set;
    expired/used/unknown → `400`, no change; weak password → `400`, no change;
    cooldown suppresses a rapid second request.
  - `resend.mailer.spec.ts`: correct `to`/`from`/subject + link from
    `APP_BASE_URL`; token never logged.
  - E2e (`test/password-reset.e2e-spec.ts`, mailer mocked, real Postgres):
    registered vs unregistered request → **byte-identical** responses; happy path
    request → capture token from the fake mailer → confirm → new password logs in
    and old fails; `400`s for bad token / weak password / malformed body;
    single-use (second confirm fails).
  - _Requirements: 2.1, 2.2, 3.4, 4.2, 4.4, 5.1, 10.3 · Design: "Testing strategy"_

- [x] 8. Verify backend build, lint, format, tests, and migration round-trip
  - _lint, format:check, build, and unit tests (171) are green. Migration
    `1730000004000` verified against a live Postgres 18.1 (Docker `postgres`
    container, `finlux` DB): `migration:run` creates `password_reset_tokens`
    (PK/FK-cascade/unique token_hash/index), `migration:revert` drops index+table
    cleanly, `migration:run` re-applies; `migration:show` lists all 5 `[X]`.
    `test:e2e password-reset` green: 6 tests incl. byte-identical
    registered/unregistered responses, happy path (new password logs in, old
    fails), and single-use (second confirm → 400)._
  - Run `pnpm --dir backend lint`, `format:check`, `build`, `test`; fix issues.
    Run `migration:run` (creates `password_reset_tokens`), `migration:show` `[X]`,
    then `migration:revert` round-trip and `migration:run` again. Run
    `test:e2e` against a reachable Postgres. If the DB is unavailable, note it:
    unit tests gate the request/confirm + single-use logic.
  - _Requirements: 9.4, 10.2 · Design: "Verification"_

## Frontend

- [x] 9. Add the API client methods (401-exempt, unauthenticated)
  - `lib/auth/api-client.ts`: `requestPasswordReset(email)` →
    `POST /auth/password-reset/request`; `confirmPasswordReset(token, password)`
    → `POST /auth/password-reset/confirm`. Both unauthenticated and **exempt from
    the global `401 → logout`** handling. Map results to safe typed outcomes;
    never log token/password. Base URL from `NEXT_PUBLIC_API_BASE_URL`.
  - _Requirements: 6.2, 7.2, 9.3 · Design: Decision 9_

- [x] 10. Forgot-password request step inside `AuthScreen`
  - `components/auth/forgot-password-form.tsx`: an email-entry step reached from
    an accessible "Forgot your password?" affordance on the login view. On submit
    call `requestPasswordReset`, show the **non-disclosing** confirmation
    (matches backend copy), validate the email client-side, indicate progress,
    prevent duplicate submits. Reuse `auth-field`, `auth-submit-button`, brand
    tokens; no new design tokens; no out-of-scope promises.
  - Wire the affordance + mode into `auth-screen.tsx` / `login-form.tsx`.
  - _Requirements: 6.1, 6.2, 6.3, 6.4 · Design: Decision 9_

- [x] 11. Reset landing route
  - `app/reset-password/page.tsx` (Client Component), separate from `AuthGate`:
    read `token` from the URL; render `components/auth/reset-password-form.tsx`
    with new-password + confirm fields (`type="password"`, accessible labels);
    validate the policy client-side (reuse `lib/auth/validation.ts`); submit
    `{ token, password }` via `confirmPasswordReset`. On success show a success
    state and route to the login view; on failure show a generic safe message
    with a "request a new link" path. Never log the token/password. Reuse brand
    tokens only.
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5 · Design: Decision 9_

- [x] 12. Verify frontend build and lint (+ optional Designer polish)
  - Run `pnpm --dir frontend lint` and `pnpm --dir frontend build`; fix issues.
    Manually confirm: the forgot affordance shows the non-disclosing message; the
    emailed link opens `/reset-password?token=…`; a valid new password succeeds
    and routes to login; the old password fails; an expired/used token shows the
    generic error with a new-link path; brand/green styling matches with no new
    tokens. Fine UI/UX polish may be delegated to the Designer.
  - _Requirements: 6.4, 7.3, 7.4, 10.2 · Design: "Verification"_

## Notes
- **First outbound-email capability** in Finlux (Resend `6.37.0`, exact pin).
  CI never sends real email — the mailer is mocked/faked.
- **Non-disclosure is a hard gate** (Req 2): identical request response + no
  token/no send for unknown emails + no timing oracle. E2e asserts byte-identical
  responses.
- **Token**: `randomBytes(32)`→base64url in the link; only the SHA-256 hash is
  stored (like `sessions`); single-use; superseded on re-request; **5-minute**
  lifetime in prod and dev.
- **Error codes**: `400` for both weak password and invalid/expired/used token
  (indistinguishable; no `410`).
- **Sessions**: pre-reset JWTs expire naturally (no server-side revocation);
  `tokenVersion`/`passwordChangedAt` is a future enhancement.
- **`RESEND_FROM`**: Resend sandbox sender `onboarding@resend.dev` for dev+prod
  for now (non-blocking); a Finlux-owned verified domain is a later ops
  enhancement. Not `@gmail.com` (can't verify SPF/DKIM/DMARC on a non-owned
  domain).
- Scope guard: no in-session "change password", no login/registration/JWT change,
  no real-money movement.

## Status
- Requirements: PM-owned (drafted).
- Design: complete (Tech Lead).
- Tasks: **implemented and verified** (Backend Engineer tasks 1–8, Frontend
  Engineer tasks 9–12). Gates green: backend `lint`/`format:check`/`build`/`test`
  (171 unit) and frontend `lint`/`format:check`/`build`/`test` (38, incl. 17 new).
  Task 6 (per-IP throttling) intentionally deferred (non-blocking). **DB
  verification closed:** migration `1730000004000` run/revert/run round-trip and
  backend `test:e2e password-reset` (6 tests) green against a live Postgres 18.1.
  First outbound-email capability (`resend@6.37.0`); CI never sends real email
  (mailer faked).

Depends on: `user-authentication`, `pii-encryption-at-rest`,
`data-model-and-persistence`, `frontend-auth-integration` (all implemented).
