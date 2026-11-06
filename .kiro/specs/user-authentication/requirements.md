# Requirements — User Authentication

## Overview
Provide user registration, login, session management, and per-user data
isolation so that each user's financial data is private and secure.

## Terminology
- **User**: a login identity (the person authenticating). "Register/create an
  account" here means creating a **User**, not a financial Account.
- **Account** (financial) is defined in `data-model-and-persistence` and is out
  of scope for this spec.

## Scope
In scope:
- Registration, login, logout, and authenticated sessions.
- Securely storing credentials and identifying the current user on requests.
- Enforcing that financial data is only accessible to its owner.

Out of scope:
- The data model itself (see `data-model-and-persistence`).
- Social/third-party login (may be a later spec).
- Any conversational/agent behavior.

## Requirements

### Requirement 1 — Registration (non-disclosing)
**User story:** As a new user, I want to create an account so that I can use
Finlux privately, without the registration endpoint revealing whether an email
is already registered.

Account-enumeration context: a registration endpoint that answers differently
for an already-registered email than for a new one is an account-existence
oracle. This spec closes that oracle by making registration **non-disclosing**,
consistent with the generic-error posture of login (Requirement 3.2) and the
password-reset request step. The chosen mitigation is a **generic response**
(not rate limiting).

Acceptance criteria (EARS):
1. WHEN a user registers with valid credentials for an email that is not already
   registered, THE SYSTEM SHALL create the user record.
2. WHEN a user registers with valid input for an email that **is** already
   registered, THE SYSTEM SHALL NOT create or modify any record, and SHALL NOT
   reveal that the email already exists.
3. THE SYSTEM SHALL return an **identical, generic success-style response** for
   both the created-new and already-registered cases (Acceptance 1 and 2), so
   that an external caller cannot distinguish them from the response. The
   response SHALL NOT include the generated user record, its id, or any field
   that differs between the two cases (a 409/"email already registered" error
   SHALL NOT be returned).
4. THE SYSTEM SHALL NOT introduce an observable timing (or other side-channel)
   difference between the created-new and already-registered cases; in
   particular, the already-registered path SHALL perform work equivalent to the
   created-new path (e.g. an equivalent constant-cost password hash) so response
   timing does not disclose account existence. (Mirrors the login timing
   mitigation.)
5. THE SYSTEM SHALL validate and sanitize all registration input; malformed
   input (bad email, weak password) SHALL be rejected with a generic validation
   error. This validation is independent of account existence and SHALL be
   applied identically whether or not the email is already registered, so it
   does not reintroduce an enumeration oracle.
6. THE SYSTEM SHALL NOT log, echo, or otherwise disclose whether a registration
   corresponded to a new or an already-registered email.

### Requirement 2 — Credential security
Acceptance criteria (EARS):
1. THE SYSTEM SHALL store passwords only as salted, hashed values using a
   well-established algorithm; it SHALL NOT store plaintext passwords.
2. THE SYSTEM SHALL NOT log or echo credentials or secrets.

### Requirement 3 — Login and session
**User story:** As a registered user, I want to log in so that I can access my
own finances.

Acceptance criteria (EARS):
1. WHEN a user submits valid credentials, THE SYSTEM SHALL establish an
   authenticated session and return/set a session token.
2. IF credentials are invalid, THEN THE SYSTEM SHALL reject the attempt with a
   generic error (no disclosure of which field was wrong).
3. WHEN a user logs out, THE SYSTEM SHALL invalidate the session.

### Requirement 4 — Authorization and isolation
Acceptance criteria (EARS):
1. THE SYSTEM SHALL require a valid session for every endpoint that reads or
   writes financial data.
2. THE SYSTEM SHALL resolve the current user from the session and scope all data
   access to that user (ties to `data-model-and-persistence` Requirement 3).
3. WHEN a request has no valid session, THE SYSTEM SHALL deny access to protected
   resources.

### Requirement 5 — Configuration and baseline
Acceptance criteria (EARS):
1. THE SYSTEM SHALL read auth secrets (e.g. token signing keys) from the
   environment, referenced by key name, and SHALL NOT commit them.
2. THE SYSTEM SHALL align with the stack in `.kiro/steering/tech.md`
   (NestJS backend, PostgreSQL) and the security baseline.

## Decisions / security findings (PM-owned)

### Decision 1 — Registration is non-disclosing via a generic response (not rate limiting)
**Status:** decided (supersedes the prior "reject with a clear error" wording of
Requirement 1).

**Finding.** The earlier contract rejected a duplicate email with an explicit
`409 "Email is already registered"` — an account-existence oracle inconsistent
with the rest of auth (login's generic `401`, Req 3.2; and the password-reset
request step's identical response for existing/non-existing emails). A sibling
**login** timing side-channel (bcrypt skipped on unknown emails) was fixed
separately as an in-scope bugfix; this decision closes the **registration**
oracle.

**Decision.** Close the oracle by making registration **non-disclosing**: an
identical generic success-style response for both the newly-created and the
already-registered cases, with no timing/side-channel difference (Requirement 1,
rewritten above). The chosen mechanism is the **generic response**, explicitly
**not** rate limiting / throttling. Rate limiting may still be adopted later as
defense-in-depth, but it is **not** the mechanism relied on to satisfy
Requirement 1 and is out of scope for this decision.

**Accepted UX tradeoff.** Because the endpoint no longer returns an inline
"that email is already in use" error, the signup form cannot tell the user to
log in instead, and registration cannot auto-log-in the newly created user
based on a distinguishable success (the response must be identical in both
cases). Front-end copy SHALL present a neutral confirmation (e.g. "If this is a
new email, your account has been created — you can now log in"). Any
email-verification or welcome-email flow that would differ per case is a
separate future decision and must preserve this non-disclosure contract.

**Reconciliation.** Requirement 1.2's former "reject with a clear error" is
intentionally removed; the generic non-disclosing response replaces it. Design
and tasks for `user-authentication` MUST be updated to match (the current
implementation's `409` on duplicate — both the find-then-create pre-check and
the `email_bidx` unique-violation mapping in `backend/src/auth/auth.service.ts`
`register()` — no longer satisfies this requirement and must be changed, keeping
the timing-equivalent work on the already-registered path).
