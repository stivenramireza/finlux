# Requirements — Password Reset (forgot password)

## Overview
Give a user who has forgotten their password a secure, self-service way to set a
new one. The flow has two steps:

1. **Request** — from the auth screen the user asks to reset their password by
   entering their email. If an account exists for that email, Finlux sends an
   email containing a time-limited, single-use reset link.
2. **Reset** — the link opens a landing page in the frontend where the user
   enters a new password (meeting the existing policy) and, on success, can log
   in with it.

Today there is **no recovery path**: if a user forgets their password they are
locked out (`user-authentication` issues only register/login; there is no reset
and no email). This spec adds that path.

This is a **security-sensitive auth feature**. It builds additively on the
implemented authentication and PII-encryption work and introduces Finlux's
**first outbound-email capability**, sent through **Resend** (PM decision; the
project uses Resend's free tier).

## Terminology
- **User**: a login identity, per `user-authentication`. Not a financial account.
- **Reset request**: the user's action of asking for a password-reset email by
  providing an email address.
- **Reset token**: a cryptographically strong, single-use, time-limited secret
  that authorizes exactly one password change for one user. It travels to the
  user only inside the reset link; the backend stores only a non-reversible hash
  of it (never the raw token), consistent with how the `sessions` table stores a
  SHA-256 hash of the JWT.
- **Reset link / landing**: the URL in the email that opens the frontend page
  where the user chooses a new password. The link carries the reset token.
- **Password policy**: the existing rule from `user-authentication` — minimum 8
  characters with at least one uppercase letter, one lowercase letter, one
  digit, and one special character.
- **Normalized email**: email trimmed and lowercased, matching the existing auth
  normalization and the blind-index derivation.
- **Email blind index (`email_bidx`)**: the deterministic keyed HMAC over the
  normalized email used to look up a user, since the email column is encrypted
  at rest and not searchable (`pii-encryption-at-rest`).

## Dependencies (consumed, not redefined here)
Builds additively on already-implemented specs:
- `user-authentication` — registration/login, bcrypt `HashingService`, the
  password policy, the 1h JWT, the audit `sessions` table, and the
  generic-non-disclosure behavior (generic 401 / 409).
- `pii-encryption-at-rest` — the email is stored encrypted; lookup and
  uniqueness go through `email_bidx`. The plaintext email needed to address the
  outbound message exists only after decrypting the located user's row.
- `data-model-and-persistence` — the `users` table and user-scoped persistence,
  TypeORM + versioned migrations conventions.
- `frontend-auth-integration` — the gated auth screen (single route with a
  login/registration toggle), the shared authenticated API client, and the
  brand/UX language the request entry point and the reset landing must reuse.

## Scope
In scope:
- A **request-reset** backend endpoint that accepts an email and, if a matching
  account exists, generates a reset token, stores only its hash with an expiry,
  and triggers a reset email to the account's address.
- Sending the **reset email** through **Resend** (the first outbound-email
  integration in Finlux), configured from the environment, with the link
  pointing at the frontend reset landing and carrying the token.
- A **reset-confirm** backend endpoint that validates the token (exists,
  unexpired, unused, matches a user), enforces the password policy, bcrypt-hashes
  and stores the new password, and invalidates the token (single use).
- A **frontend request entry point** on the auth screen ("Forgot your
  password?") that collects the email and calls the request endpoint.
- A **frontend reset landing** that reads the token from the link, collects and
  validates a new password, calls the confirm endpoint, and guides the user to
  log in on success.
- Preserving Finlux's non-disclosure posture: the request step must not reveal
  whether an email is registered.
- Configuration (by key name, documented in `.env.example`) for the email
  provider and the token lifetime; security baseline (no secrets/tokens logged).

Out of scope:
- Changing login, registration, or the JWT/session mechanism themselves
  (`user-authentication`).
- The data model for transactions or any financial behavior.
- Email **verification at signup**, "magic-link" passwordless login, 2FA/MFA,
  or account-recovery via anything other than the registered email.
- Changing the password while logged in (an authenticated "change password"
  flow) — this spec is specifically for the **forgotten/unauthenticated** case;
  an in-session change may be a later spec.
- Internationalization of the email template beyond following the product's
  existing language approach (the agent defaults to Spanish / English by context;
  the exact email localization strategy is a design decision).
- Rich transactional-email features (open/click tracking, templated campaigns);
  this is a single functional transactional email.
- Any real-money movement or regulated advice (product non-goals, unaffected).

## Requirements

### Requirement 1 — Request a password reset
**User story:** As a user who forgot my password, I want to request a reset by
entering my email, so that I can regain access to my account.

Acceptance criteria (EARS):
1. THE SYSTEM SHALL expose an unauthenticated endpoint that accepts an email and
   starts a password-reset request.
2. WHEN a reset is requested for an email that matches an existing account
   (resolved via the `email_bidx` blind index over the normalized email), THE
   SYSTEM SHALL generate a cryptographically strong reset token, persist only a
   non-reversible hash of it together with the owning user and an expiry, and
   send a reset email to that account's email address.
3. THE SYSTEM SHALL validate and sanitize the submitted email; IF the input is
   malformed, THEN THE SYSTEM SHALL reject the request with `400 Bad Request`.
4. THE reset email SHALL contain a link to the frontend reset landing that
   carries the reset token, and SHALL NOT contain the user's password or any
   other credential.

### Requirement 2 — Non-disclosure of account existence
**User story:** As the product owner, I want the request step to not reveal
whether an email is registered, so that the feature cannot be used to enumerate
accounts, consistent with Finlux's existing generic-error behavior.

Acceptance criteria (EARS):
1. WHEN a reset is requested, THE SYSTEM SHALL return the **same** success-style
   response whether or not the email matches an existing account (e.g. "If an
   account exists for that email, we've sent reset instructions"), with no
   difference an external caller can observe.
2. WHERE the email does not match any account, THE SYSTEM SHALL NOT send an
   email and SHALL NOT create a reset token, while still returning the identical
   response from 2.1.
3. THE SYSTEM SHALL avoid introducing an observable timing or status difference
   that discloses whether the email exists (the request-step response is
   indistinguishable for existing vs non-existing accounts).

### Requirement 3 — Reset token security
**User story:** As a user, I want the reset link to be safe, so that only I can
use it and only briefly.

Acceptance criteria (EARS):
1. THE reset token SHALL be generated from a cryptographically secure random
   source with sufficient entropy to be infeasible to guess.
2. THE SYSTEM SHALL store only a non-reversible hash of the token at rest (never
   the raw token), consistent with how the `sessions` table stores a hashed JWT.
3. THE reset token SHALL expire after a configured, short lifetime; WHEN a token
   is used after its expiry, THE SYSTEM SHALL reject it and SHALL NOT change the
   password.
4. THE reset token SHALL be **single-use**: WHEN a password is successfully
   reset with a token, THE SYSTEM SHALL invalidate that token so it cannot be
   reused.
5. WHERE a new reset is requested for an account that already has an outstanding
   (unused, unexpired) token, THE SYSTEM SHALL ensure a previously issued token
   cannot be combined with a newer one to bypass single-use/expiry (the exact
   invalidation strategy — e.g. superseding prior tokens — is a design decision).

### Requirement 4 — Confirm the reset and set a new password
**User story:** As a user, I want to set a new password from the reset link, so
that I can log in again.

Acceptance criteria (EARS):
1. THE SYSTEM SHALL expose an unauthenticated endpoint that accepts a reset
   token and a new password and completes the reset.
2. WHEN the token is valid (exists, unexpired, unused) AND the new password
   meets the password policy, THE SYSTEM SHALL bcrypt-hash and store the new
   password for the owning user, invalidate the token, and confirm success.
3. THE SYSTEM SHALL enforce the existing password policy on the new password
   (min 8 chars, upper, lower, digit, special); IF the new password is invalid,
   THEN THE SYSTEM SHALL reject with `400 Bad Request` and SHALL NOT change the
   password.
4. IF the token is missing, malformed, unknown, expired, or already used, THEN
   THE SYSTEM SHALL reject the request with a generic error and SHALL NOT change
   any password, without disclosing which of those conditions applied.
5. THE SYSTEM SHALL NOT automatically establish an authenticated session as part
   of the reset; after a successful reset the user proceeds to log in with the
   new password (consistent with the existing login flow). (Whether to auto-login
   is a design decision; the default is to require an explicit login.)

### Requirement 5 — Effect of a successful reset on sessions
**User story:** As a user who resets because I fear my account was compromised,
I want the reset to meaningfully protect my account.

Acceptance criteria (EARS):
1. WHEN a password is successfully reset, THE SYSTEM SHALL ensure the new
   password is required for subsequent logins and the old password no longer
   works.
2. WHERE existing access tokens issued before the reset are still within their
   1h lifetime, THE SYSTEM SHALL document the chosen behavior for them
   (the stateless JWT is not server-revoked today; whether the reset forces
   existing tokens to stop working is a design decision, constrained by the
   current access-only JWT model from `user-authentication`).

### Requirement 6 — Frontend request entry point
**User story:** As a user on the login screen, I want a clear "forgot password"
affordance, so that I can start recovery without help.

Acceptance criteria (EARS):
1. THE auth screen SHALL present an accessible "Forgot your password?" entry
   point from the login view that leads to an email-entry step.
2. WHEN the user submits their email, THE SYSTEM SHALL call the request endpoint
   using the existing frontend API client and configuration, and SHALL show a
   confirmation that matches the backend's non-disclosing message (Requirement
   2.1) — i.e. it SHALL NOT tell the user whether the email was registered.
3. THE request UI SHALL validate the email client-side, indicate progress, and
   prevent duplicate submissions while a request is in flight, consistent with
   the existing auth forms.
4. THE entry point and its screens SHALL reuse the Finlux brand presentation and
   `--brand` design tokens from `frontend-auth-integration` /
   `agentic-chat-layout`, introducing no new design tokens, and SHALL NOT promise
   out-of-scope capabilities.

### Requirement 7 — Frontend reset landing
**User story:** As a user who clicked the email link, I want a page to set a new
password, so that I can finish recovery.

Acceptance criteria (EARS):
1. WHEN the reset landing opens, THE SYSTEM SHALL read the reset token from the
   link and present a form to enter (and confirm) a new password, with
   accessible labels and `type="password"` fields.
2. THE landing SHALL validate the new password against the policy client-side
   before submitting, and SHALL submit the token plus the new password to the
   confirm endpoint.
3. WHEN the confirm succeeds, THE SYSTEM SHALL show a clear success state and
   route the user to the login view to sign in with the new password.
4. IF the confirm fails because the token is invalid/expired/used or the
   password is rejected, THEN THE SYSTEM SHALL show a clear, generic, safe
   message (no internal details, no disclosure of which token condition applied)
   and SHALL offer a path to request a new reset link.
5. THE landing SHALL reuse the existing brand/UX language and SHALL NOT log the
   token, the new password, or any credential.

### Requirement 8 — Email delivery and configuration
**User story:** As an operator, I want email sending configured safely, so that
the feature works across environments without committing secrets.

Acceptance criteria (EARS):
1. THE SYSTEM SHALL send the reset email through **Resend**, configured from the
   environment by key name (e.g. the Resend API key and the verified sender/from
   address), documented in `backend/.env.example` with no real values; `.env`
   stays git-ignored and the Resend credentials are never committed.
2. THE SYSTEM SHALL read the reset-token lifetime and the frontend base URL used
   to build the reset link from configuration (no hard-coded links), documented
   in `.env.example`.
3. IF sending the email fails (Resend/transport error), THEN THE SYSTEM SHALL
   handle it without leaking internals to the caller and SHALL still preserve the
   non-disclosing request response (Requirement 2.1); the precise failure
   handling (e.g. internal logging without PII, retry/queue) is a design
   decision.
4. THE SYSTEM SHALL resolve the recipient address by decrypting the located
   user's stored email (which is encrypted at rest), consistent with
   `pii-encryption-at-rest`, and SHALL send only to that address.
5. THE SYSTEM SHALL operate within Resend's free-tier constraints (sending
   quota and a verified sending domain/address); the chosen sender identity and
   staying within quota SHALL be documented, and quota limits inform the abuse
   mitigation in Requirement 9.5.

### Requirement 9 — Validation, errors, and security baseline
**User story:** As any client, I want predictable, safe behavior, so that the
feature cannot be abused or leak sensitive data.

Acceptance criteria (EARS):
1. THE SYSTEM SHALL validate and sanitize all request bodies using the backend's
   global validation, rejecting malformed input with `400 Bad Request`.
2. THE SYSTEM SHALL NOT log reset tokens, raw email addresses in a way that
   creates a plaintext PII record, passwords, provider credentials, or other
   secrets; it SHALL treat email and password as sensitive PII.
3. THE SYSTEM SHALL NOT include stack traces, SQL, provider internals, tokens,
   or other internal details in any error response.
4. THE SYSTEM SHALL use parameterized access via TypeORM (no string-interpolated
   queries) and manage any schema change through a versioned migration.
5. THE SYSTEM SHOULD mitigate abuse of the request endpoint (e.g. a large volume
   of reset emails to one address), also to stay within Resend's free-tier
   sending quota; whether this is rate limiting, throttling, or a per-account
   outstanding-request cap is a design decision, but the requirement to mitigate
   abuse SHALL be addressed.

### Requirement 10 — Stack alignment and quality
**User story:** As a developer, I want the feature to fit the project's stack and
pass its checks.

Acceptance criteria (EARS):
1. THE backend SHALL align with `.kiro/steering/tech.md` (NestJS, TypeORM, ESM
   with `.js` import specifiers, PostgreSQL) and live under `backend/src/`; the
   frontend SHALL align with `frontend/AGENTS.md` and the existing
   `components/auth/*` + `lib/auth/*` building blocks, under `frontend/src/`.
2. THE implementation SHALL pass the per-app gates:
   `pnpm --dir backend lint`, `format:check`, `build`, `test`; and
   `pnpm --dir frontend lint`, `build`.
3. THE implementation SHALL include automated tests covering: a non-existent
   email yields the identical non-disclosing response and sends no email and
   creates no token; a valid request creates a hashed, expiring, single-use
   token and triggers sending; an expired/used/unknown token is rejected with no
   password change; a policy-violating new password is rejected; and a valid
   confirm updates the password hash and invalidates the token. The Resend email
   client SHALL be mockable so tests are deterministic and never send real
   email.

## Open questions / decisions for design
Flagged for the Tech Lead / Solution Architect to resolve in `design.md`; the
requirements above are intentionally agnostic to them:
- **Email provider & abstraction**: the provider is fixed as **Resend** (PM
  decision, free tier). The design chooses the SDK (e.g. the `resend` Node
  package) and its pinned version, and defines the mailer abstraction/port so
  the Resend client is mockable in tests (no real email in CI). First
  outbound-email capability in Finlux.
- **Token storage**: a dedicated `password_reset_tokens` table (columns, FK to
  `users` with cascade, hashed-token column, `expires_at`, `used_at`/`consumed`,
  indexes) vs reusing/extending existing structures; the hashing choice
  (SHA-256, matching `sessions`) and the token encoding in the link.
- **Single-use & supersede strategy** (Req 3.5): whether requesting a new token
  invalidates prior outstanding tokens for the account.
- **Session impact** (Req 5.2): whether/how to affect still-valid pre-reset JWTs
  given the stateless, access-only, non-revocable token model — and whether to
  record/revoke via the audit `sessions` table.
- **Auto-login after reset** (Req 4.5): default is explicit login; design may
  justify issuing a session directly.
- **Abuse mitigation** (Req 9.5): rate limiting vs per-account outstanding-token
  cap vs cooldown, and where it lives.
- **Frontend routing for the landing**: a dedicated route (e.g. `/reset-password`)
  reading the token from the URL vs extending the single gated route; how it
  coexists with the `AuthGate`.
- **Email content & localization**: template, sender identity, and language
  selection (Spanish/English) consistent with the product's language approach.

## Status
- Requirements: drafted (PM), ready for review.
- Design (`design.md`): not started — pending Tech Lead (architecture), informed
  by the Solution Architect (email provider, token model, session impact).
- Tasks (`tasks.md`): not started — pending design.

Depends on: `user-authentication` (implemented — password policy, hashing, JWT,
audit `sessions`, generic non-disclosure), `pii-encryption-at-rest`
(implemented — encrypted email + `email_bidx` lookup), `data-model-and-persistence`
(implemented — `users`, migrations), `frontend-auth-integration` (implemented —
gated auth screen, shared API client, brand/UX).
