# Design — Password Reset (forgot password)

> Authored by the Tech Lead (folding the Solution Architect's input on the email
> provider, token model, and session impact). Persisted by the PM on the Tech
> Lead's behalf because the Tech Lead role has no file-write tool wired in this
> environment; the content is the Tech Lead's verbatim design decisions. It is
> authoritative for implementation. The Backend/Frontend Engineers implement
> against it. Requirements (`requirements.md`) are PM-owned and unchanged.

## Goal
Add a secure, self-service **forgot-password** recovery path for the
**unauthenticated** user, in two steps:
1. **Request** — the user submits their email; if an account exists, Finlux
   emails a **time-limited, single-use** reset link.
2. **Reset** — the link opens a frontend landing where the user sets a new
   password (existing policy) and then logs in.

This introduces Finlux's **first outbound-email capability**, via **Resend**
(PM decision, free tier). Backend (NestJS 12, TypeORM, ESM `.js` specifiers,
PostgreSQL) + frontend (Next.js App Router) only; additive on
`user-authentication`, `pii-encryption-at-rest`, `data-model-and-persistence`,
and `frontend-auth-integration`. No change to login/registration or the
JWT/session mechanism.

## Tech context (verified against the codebase)
- NestJS 12, Node 24.22.1, ESM (`"type":"module"`, intra-project imports end in
  `.js`), TypeORM, PostgreSQL; global `ValidationPipe`
  (`whitelist`+`forbidNonWhitelisted`+`transform`) already in `main.ts`.
- `AuthService`/`UsersService` normalize email and resolve users via the
  **`email_bidx`** blind index (`findByEmail`, `findByEmailWithPassword`);
  `CryptoService` exposes `normalizeEmail`, `blindIndex`, and the transparent
  encrypted-column transformer. The plaintext email exists only after decrypting
  the located user's row.
- `HashingService` (bcrypt) and the password policy live in the `auth` module
  (`RegisterDto`). Reused verbatim for the new password.
- `sessions` (audit-only) stores a **SHA-256 hash** of the JWT, never the raw
  token; the guard does **not** read it (token validity is stateless). This is
  the precedent the reset token follows (store only a hash).
- Migrations are explicit imports registered in **both** `data-source.ts` and
  `database.module.ts`; the latest is `1730000003000`. New migration uses a
  later timestamp.
- Frontend auth building blocks exist under `components/auth/*`
  (`auth-screen.tsx`, `auth-field.tsx`, `auth-submit-button.tsx`,
  `login-form.tsx`, `auth-gate.tsx`, …) and `lib/auth/*` (`api-client.ts`,
  `auth-provider.tsx`, `config.ts`, `validation.ts`, `types.ts`). Brand tokens
  `--brand` only; no new design tokens.

## Resolved decisions

### Decision 1 — Email provider & abstraction (Resend)
- Dependency: **`resend` pinned exactly `6.37.0`** (MIT, Node ≥20, ESM+CJS+types;
  no typosquat; the optional `@react-email/render` peer is **not** installed —
  emails are plain `html` + `text`). Added to `backend` `dependencies` with an
  exact pin.
- Abstraction: a provider-agnostic **`MailerPort`** interface with
  `sendPasswordResetEmail({ to, resetUrl, locale })`, bound to a DI token
  **`MAILER`**. `ResendMailer` implements it (reads `RESEND_API_KEY` /
  `RESEND_FROM` via `ConfigService`). Tests inject a **fake mailer**, so CI never
  sends real email (Req 8, 10.3).
- A `MailModule` (`@Global()` or imported where needed) provides `MAILER`.

### Decision 2 — Token storage: dedicated `password_reset_tokens` table
A new table (snake_case plural), FK to `users` with cascade, storing only the
**hash** of the token (Req 3.2):

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` PK | `gen_random_uuid()` (`pk_password_reset_tokens`) |
| `user_id` | `uuid` NOT NULL FK → `users.id` | `ON DELETE CASCADE` (`fk_password_reset_tokens_user`) |
| `token_hash` | `varchar` NOT NULL **unique** | SHA-256 **hex** of the raw token (`uq_password_reset_tokens_token_hash`) |
| `expires_at` | `timestamptz` NOT NULL | issue time + configured lifetime |
| `used_at` | `timestamptz` NULL | set when consumed (single-use) |
| `created_at` / `updated_at` | `timestamptz` | `@CreateDateColumn`/`@UpdateDateColumn` |

Index `idx_password_reset_tokens_user_id` on `user_id`. Migration
`1730000004000-CreatePasswordResetTokenTable.ts`, registered in `data-source.ts`
**and** `database.module.ts`; `down()` drops the index then the table.

- **Raw token**: `randomBytes(32)` → **base64url** (Req 3.1), carried only in the
  reset link. Only `token_hash = sha256(raw)` is persisted; lookup is by
  `token_hash` (no SQL over encrypted columns).
- Hash choice SHA-256 mirrors `sessions` (Req 3.2).

### Decision 3 — Token lifetime: 5 minutes, fixed (prod and dev)
The reset token expires **5 minutes** after issuance in **all** environments
(PM decision). It is **independent** of `JWT_EXPIRES_IN`. Configurable via
`PASSWORD_RESET_TOKEN_TTL` with a default of `5m`; documented in `.env.example`
(Req 3.3, 8.2). Short by design for a finance recovery flow.

### Decision 4 — Single-use & supersede
A token is valid iff `used_at IS NULL AND expires_at > now()`. Requesting a new
reset for an account **invalidates any outstanding tokens** for that user and
inserts the new one in a **single transaction**, so at most one live token per
account exists at a time (Req 3.4, 3.5). Consumption on confirm is an atomic,
anti-race update (`UPDATE … SET used_at = now() WHERE id = :id AND used_at IS
NULL` and check the affected row count) before the password write.

### Decision 5 — Non-disclosure & timing (Req 2)
- The request endpoint **always** returns the same `200`/`202` body (e.g.
  "If an account exists for that email, we've sent reset instructions"),
  regardless of whether the email matched (Req 2.1).
- When the email does not resolve via `email_bidx`, **no token is created and no
  email is sent** (Req 2.2).
- **Timing**: the HTTP response does not block on the (variable-latency) Resend
  call — email sending is dispatched **after** the response is committed (fire-
  and-forget with internal error logging, no PII), so the response time does not
  reveal whether a send happened (Req 2.3, 8.3). A send failure is logged
  internally (no token/PII) and never changes the caller-visible response.

### Decision 6 — Confirm endpoint, validation & error codes
- `POST /auth/password-reset/request` — body `{ email }`
  (`@IsEmail`); unauthenticated; returns the uniform non-disclosing response.
- `POST /auth/password-reset/confirm` — body `{ token, password }`; `token`
  `@IsString @IsNotEmpty`; `password` reuses the **existing policy** decorators
  from `RegisterDto` (min 8, upper, lower, digit, special — Req 4.3).
  Unauthenticated. On success: bcrypt-hash via `HashingService`, update
  `users.password`, mark the token `used_at`, return success.
- **Error codes (PM-confirmed):** a policy-violating password and an
  invalid/expired/used/unknown token are **both `400`** with a **generic**
  message, intentionally indistinguishable, so no oracle reveals which condition
  failed (Req 4.4). (A `410 Gone` for the token was considered and rejected: it
  would create a distinguishable token-vs-policy oracle, weakening non-
  disclosure.)
- No auto-login (Req 4.5): the confirm response does not issue a JWT; the user
  logs in explicitly.

### Decision 7 — Session impact (Req 5.2)
Access tokens issued **before** the reset remain valid until their natural
expiry. Finlux's JWT is **stateless, access-only, with a 5-minute production
lifetime** and no server-side revocation; forcing pre-reset tokens to stop
working would require changing that model (a per-user `tokenVersion` /
`passwordChangedAt` claim checked on every request), which is **out of scope**
here. Documented residual risk: a pre-reset token stays usable for at most the
JWT lifetime. The `tokenVersion`/`passwordChangedAt` revocation mechanism is
recorded as a **future enhancement**. (PM-accepted for this version.)

### Decision 8 — Abuse mitigation (Req 9.5)
- **Per-account cooldown** (DB-backed): a new request for an account that
  requested within `PASSWORD_RESET_REQUEST_COOLDOWN` (default `60s`) does not
  issue/send again, while still returning the uniform response (no disclosure,
  protects the Resend free-tier quota).
- **At most one live token per account** (Decision 4) caps outstanding tokens.
- Optional **per-IP rate limit** via `@nestjs/throttler` on the request route
  (defense-in-depth; does not leak account existence).

### Decision 9 — Frontend routing & reuse
- **Dedicated landing** `app/reset-password/page.tsx` (Client Component) that
  reads the `token` from the URL query, **separate from the `AuthGate`** (it is
  reachable while unauthenticated and does not render the chat). It presents a
  new-password + confirm form (`type="password"`, accessible labels), validates
  the policy client-side (reusing `lib/auth/validation.ts`), submits
  `{ token, password }` to the confirm endpoint, shows a success state and routes
  to the login view on success, and shows a generic safe error (with a "request a
  new link" path) on failure (Req 7).
- **Request step** as a **mode within `AuthScreen`**: a "Forgot your password?"
  affordance on the login view leads to an email-entry step that calls the
  request endpoint and shows the non-disclosing confirmation (Req 6). Reuses
  `auth-field`, `auth-submit-button`, brand tokens; no new design tokens.
- **API client**: two new **unauthenticated** methods on `AuthApiClient`
  (`requestPasswordReset(email)`, `confirmPasswordReset(token, password)`),
  **exempt from the global `401 → logout`** handling (there is no session).
  The frontend base URL already comes from `NEXT_PUBLIC_API_BASE_URL`.
- The reset link is built from **`APP_BASE_URL`** (backend config) +
  `/reset-password?token=…` (Req 8.2) — no hard-coded host.
- Fine-grained UI/UX polish may be delegated to the Designer; this design fixes
  the routing architecture and reuse.

### Decision 10 — Email content & localization
- A single transactional email: subject + body with the reset link, an
  explicit **5-minute** expiry notice, and a "if you didn't request this, ignore"
  line. Plain `html` + `text`, no tracking (Req scope).
- **Localization**: Spanish by default, English by context — selected from the
  request's `Accept-Language` (or an optional `locale` field on the request
  body), defaulting to `es`. Consistent with the product's language approach.
- **Sender identity (`RESEND_FROM`)**: **for now, Resend's shared sandbox sender
  `onboarding@resend.dev`** is used in **both dev and production** as a
  **non-blocking** default (no domain purchase required to ship). Documented by
  key name; the value is set in the environment. Caveat: the sandbox sender has
  Resend limits (typically only delivers to the Resend account owner's own email
  and a low quota), so it validates the end-to-end flow but is **not** suitable
  for sending to arbitrary users at scale. Migrating to a **Finlux-owned verified
  domain** (e.g. `no-reply@<finlux-domain>`) for real deliverability is a later
  **operational enhancement**, tracked as a PM/ops item — not a release blocker.
  (Note: `stivenramireza@gmail.com` cannot be a `from`: Gmail is not a
  Finlux-controlled domain, so SPF/DKIM/DMARC cannot be configured for it and
  mailbox providers would reject/spam such mail.)

## Module / file structure
```
backend/src/auth/
├── auth.controller.ts                 # MODIFIED — add request + confirm routes
├── auth.service.ts                    # MODIFIED — delegate to PasswordResetService
├── password-reset/                    # NEW
│   ├── password-reset.service.ts      # request + confirm logic (tx, single-use)
│   ├── password-reset.module.ts
│   ├── entities/password-reset-token.entity.ts
│   └── dto/
│       ├── request-password-reset.dto.ts   # { email }
│       └── confirm-password-reset.dto.ts    # { token, password }
backend/src/mail/                      # NEW — first outbound-email capability
├── mail.module.ts                     # provides MAILER
├── mailer.port.ts                     # MailerPort interface + MAILER token
└── resend.mailer.ts                   # ResendMailer (resend@6.37.0)
backend/src/database/migrations/
└── 1730000004000-CreatePasswordResetTokenTable.ts   # NEW (registered in both files)
backend/.env.example                   # MODIFIED — new keys (names only)

frontend/src/
├── app/reset-password/page.tsx        # NEW — reset landing (Client Component)
├── components/auth/
│   ├── forgot-password-form.tsx       # NEW — email-entry step
│   └── reset-password-form.tsx        # NEW — new-password form
└── lib/auth/api-client.ts             # MODIFIED — request/confirm methods (401-exempt)
```

## Configuration (`.env.example`, names only)
```
# --- Password reset / outbound email (Resend) ---
RESEND_API_KEY=                     # Resend API key (free tier). Never commit.
RESEND_FROM=Finlux <onboarding@resend.dev>  # Resend sandbox sender (dev+prod for now; swap for a verified domain later).
APP_BASE_URL=http://localhost:3000  # Frontend base URL used to build the reset link.
PASSWORD_RESET_TOKEN_TTL=5m         # Reset-link lifetime (5 minutes, prod and dev).
PASSWORD_RESET_REQUEST_COOLDOWN=60s # Per-account cooldown between reset requests.
```

## Testing strategy (Req 10.3)
Deterministic, no real email (inject the **fake mailer**):
- **Unit** (`password-reset.service.spec.ts`, mocked repo + mailer + crypto):
  non-existent email → uniform response, **no token created, mailer not called**;
  existing email → one hashed, 5-min-expiring, single-use token persisted + one
  `sendPasswordResetEmail`; requesting again supersedes the prior token (≤1
  live); confirm with a valid token + valid password → `users.password` updated,
  token `used_at` set; expired/used/unknown token → `400`, **no password
  change**; policy-violating password → `400`, no change; cooldown suppresses a
  rapid second request.
- **Mailer** (`resend.mailer.spec.ts`): builds the correct `to`/`from`/subject
  and a link from `APP_BASE_URL`; never logs the token.
- **E2E** (`test/password-reset.e2e-spec.ts`, mailer mocked, real Postgres):
  request for a registered vs unregistered email returns **byte-identical**
  responses; the happy path (request → read the token the fake mailer captured →
  confirm → login with the new password succeeds and the old password fails);
  `400`s for bad token / weak password / malformed body; token is single-use
  (second confirm fails).
- Gates: `pnpm --dir backend lint`/`format:check`/`build`/`test`,
  `pnpm --dir backend test:e2e` (DB reachable); `pnpm --dir frontend lint`/`build`.

## Verification
- Backend + frontend gates green (Req 10.2).
- Migration `migration:run` creates `password_reset_tokens`; `migration:revert`
  rolls back cleanly; `migration:show` lists it applied.
- Manual: request from the auth screen shows the non-disclosing confirmation;
  the emailed link opens `/reset-password?token=…`; setting a valid new password
  succeeds and routes to login; the old password no longer works; an expired/used
  token shows the generic error with a "request a new link" path.

## Notes to the Product Manager (requirements.md unchanged)
Resolved per the PM review:
1. **Error codes (Req 4.4):** `400` for both a policy-violating password and an
   invalid/expired/used token (indistinguishable) — **PM-confirmed**; `410` was
   rejected to avoid a disclosure oracle.
2. **Email localization:** Spanish default / English by context (`Accept-Language`
   or optional `locale`) — **PM-confirmed**.
3. **`RESEND_FROM`:** set to Resend's sandbox sender `onboarding@resend.dev` for
   **both dev and production** as a **non-blocking** default (PM decision — ship
   without buying a domain). A Finlux-owned verified domain for real
   deliverability is a later ops enhancement, not a release blocker.
   `stivenramireza@gmail.com` is explicitly **not** usable as a `from` (Gmail is
   not a Finlux-controlled domain; SPF/DKIM/DMARC cannot be set for it).
4. **Token lifetime:** fixed at **5 minutes in prod and dev** (PM decision),
   independent of the JWT lifetime.
5. **Session impact (Req 5.2):** pre-reset JWTs expire naturally (no server-side
   revocation); `tokenVersion`/`passwordChangedAt` revocation is a future
   enhancement — **PM-accepted** for this version.

## Status
- Requirements: PM-owned (drafted).
- Design: **complete (Tech Lead).** All open questions resolved above.
- Tasks (`tasks.md`): written (Tech Lead) against this design.

Depends on: `user-authentication`, `pii-encryption-at-rest`,
`data-model-and-persistence`, `frontend-auth-integration` (all implemented).
