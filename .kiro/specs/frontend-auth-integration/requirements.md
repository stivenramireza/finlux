# Requirements — Frontend Auth Integration

## Overview
Wire the Next.js frontend (`frontend/`) to the backend authentication built in
the `user-authentication` spec so that a person can register, log in, and log
out from the browser. This spec turns the static chat layout
(`agentic-chat-layout`) into a gated experience:

- When **not** authenticated, the home screen shows **only** authentication
  (login / registration) — no chat.
- When **authenticated**, the home screen shows **only** the chat plus a **log
  out** control — no login/registration form.

This is a frontend + wiring spec. It consumes the existing backend endpoints; it
does not add or change backend behavior.

## Terminology
- **User**: a login identity (the person authenticating), per
  `user-authentication`. Not a financial account.
- **Access token**: the 1-hour JWT returned by `POST /auth/login`
  (`accessToken`), used to authenticate subsequent API calls.
- **Authenticated state**: the frontend holds a valid, non-expired access token.
- **Unauthenticated state**: no token, or the token is missing/expired.
- **Auth screen**: the login/registration UI shown in the unauthenticated state.
- **Chat screen**: the existing `ChatShell` from `agentic-chat-layout`, shown in
  the authenticated state.

## Backend contract (consumed, not defined here)
These are the shapes the frontend integrates against, as implemented in
`user-authentication` (`#[[file:../user-authentication/design.md]]`). This spec
does not change them.
- `POST /auth/register` — request body `{ email: string, password: string,
  displayName?: string }`. On success responds `201` with the public user
  (`{ id, email, displayName, createdAt, updatedAt }`) and **no** password.
- `POST /auth/login` — request body `{ email: string, password: string }`. On
  success responds `200` with `{ accessToken: string, user: PublicUser }`.
- Invalid credentials return a **generic `401`** (no indication of which field
  was wrong). Malformed input is rejected by the backend's global validation
  with `409` for a duplicate email on register and `400`/`401` otherwise.
- There is **no** server-side logout endpoint: the access token is stateless and
  expires after 1 hour; logout is performed client-side by discarding the token.

## Scope
In scope:
- An **auth screen** on the home route with **login** and **registration**
  (the two backend flows), including client-side input validation and error
  display.
- Conditional rendering of the home route: auth screen when unauthenticated,
  chat + log-out control when authenticated.
- Calling `POST /auth/register` and `POST /auth/login`, handling success and
  error responses, and establishing the authenticated session in the client.
- Storing the access token on the client and restoring the authenticated state
  on reload until the token expires.
- A **log out** control that returns the user to the auth screen by discarding
  the token (client-side only).
- Configurable backend base URL via a frontend environment variable
  (documented in a committed `.env.example`).

Out of scope:
- Any backend change (endpoints, tokens, session table) — owned by
  `user-authentication`.
- A dedicated logout API, token refresh, or server-side session revocation
  (the token is access-only and expires in 1h, per `user-authentication`).
- Social/third-party login, password reset, email verification, "remember me".
- The chat's real messaging/agent behavior — still static per
  `agentic-chat-layout`; this spec only gates access to it.
- Protecting backend financial endpoints (none exist yet; future specs apply the
  delivered `JwtAuthGuard`).
- Multi-page routing beyond what gating the home route requires.

## Requirements

### Requirement 1 — Gated home screen
**User story:** As a visitor, I want the home screen to reflect whether I am
logged in, so that I only see what is relevant to me.

Acceptance criteria (EARS):
1. WHEN the home route loads AND the user is unauthenticated, THE SYSTEM SHALL
   display the auth screen (login / registration) and SHALL NOT render the chat
   screen.
2. WHEN the home route loads AND the user is authenticated, THE SYSTEM SHALL
   display the chat screen together with a log-out control, and SHALL NOT render
   the login or registration form.
3. THE SYSTEM SHALL determine authenticated vs unauthenticated state from the
   presence of a valid, non-expired access token.
4. WHILE the authentication state is still being determined on initial load
   (e.g. reading a persisted token), THE SYSTEM SHALL NOT briefly flash the chat
   screen to an unauthenticated user.

### Requirement 2 — Registration
**User story:** As a new user, I want to create an account from the frontend, so
that I can start using Finlux.

Acceptance criteria (EARS):
1. THE auth screen SHALL offer a registration form with, at minimum, email and
   password fields (and an optional display-name field), with accessible labels.
2. THE registration form SHALL validate input on the client before submitting:
   a syntactically valid email and a password meeting the backend policy
   (minimum 8 characters with at least one uppercase letter, one lowercase
   letter, one digit, and one special character).
3. WHEN the user submits a valid registration, THE SYSTEM SHALL call
   `POST /auth/register` with the entered values.
4. WHEN registration succeeds, THE SYSTEM SHALL bring the user into the
   authenticated state without requiring them to re-type credentials
   (e.g. by logging them in), landing on the chat screen.
5. IF the backend rejects registration because the email already exists, THEN
   THE SYSTEM SHALL show a clear, field-appropriate error without exposing
   internal details.
6. IF the backend rejects registration for any other validation reason, THEN
   THE SYSTEM SHALL show a clear error and keep the user on the auth screen with
   their (non-password) input preserved.

### Requirement 3 — Login
**User story:** As a registered user, I want to log in from the frontend, so
that I can access my chat.

Acceptance criteria (EARS):
1. THE auth screen SHALL offer a login form with email and password fields and
   accessible labels, and SHALL let the user switch between the login and
   registration forms.
2. WHEN the user submits credentials, THE SYSTEM SHALL call `POST /auth/login`.
3. WHEN login succeeds, THE SYSTEM SHALL store the returned access token and
   transition to the authenticated state (chat screen).
4. IF login fails with the generic `401`, THEN THE SYSTEM SHALL show a single
   generic error message (e.g. "Invalid email or password") that does NOT reveal
   which field was wrong, consistent with the backend's non-disclosure behavior.
5. WHILE a login or registration request is in flight, THE SYSTEM SHALL indicate
   progress and SHALL prevent duplicate submissions.

### Requirement 4 — Session persistence and token handling
**User story:** As a logged-in user, I want to stay logged in across reloads
until my session expires, so that I am not asked to log in on every page load.

Acceptance criteria (EARS):
1. WHEN login or auto-login after registration succeeds, THE SYSTEM SHALL
   persist the access token on the client so the authenticated state survives a
   page reload.
2. WHEN a persisted token is present but already expired, THE SYSTEM SHALL treat
   the user as unauthenticated and show the auth screen.
3. THE SYSTEM SHALL attach the access token to authenticated requests to the
   backend using the `Authorization: Bearer <token>` scheme (for use by this and
   later features).
4. WHERE an authenticated API call returns `401` (e.g. the token expired
   mid-session), THE SYSTEM SHALL discard the token and return the user to the
   auth screen.
5. THE SYSTEM SHALL NOT log the access token or credentials to the console or
   any telemetry.

### Requirement 5 — Logout
**User story:** As a logged-in user, I want to log out, so that my session is
ended on this device.

Acceptance criteria (EARS):
1. WHEN the user is authenticated, THE SYSTEM SHALL display a clearly labelled,
   accessible log-out control alongside the chat.
2. WHEN the user activates log out, THE SYSTEM SHALL discard the stored access
   token and return to the auth screen.
3. AFTER logging out, THE SYSTEM SHALL require credentials again to re-enter the
   authenticated state (no silent re-authentication from the discarded token).
4. THE log-out flow SHALL NOT depend on a backend endpoint (logout is
   client-side; the token expires on its own), consistent with
   `user-authentication`.

### Requirement 6 — Configuration
**User story:** As a developer, I want the backend URL to be configurable, so
that the frontend works across environments without code changes.

Acceptance criteria (EARS):
1. THE SYSTEM SHALL read the backend base URL from a frontend environment
   variable (e.g. a `NEXT_PUBLIC_`-prefixed key) rather than a hard-coded value.
2. THE SYSTEM SHALL document the required key(s) in a committed
   `frontend/.env.example`, with no real values, and SHALL keep `frontend/.env`
   git-ignored.

### Requirement 7 — Accessibility, UX, and quality
**User story:** As any user, I want the auth experience to be accessible,
on-brand, and well-built.

Acceptance criteria (EARS):
1. THE auth screen SHALL use semantic forms with associated labels, validation
   messages linked to their fields, and keyboard operability; password inputs
   SHALL use `type="password"`.
2. THE auth screen SHALL reuse the Finlux brand presentation (name, tagline, and
   the green `--brand` design token from `agentic-chat-layout`) so login,
   registration, and chat feel like one product.
3. THE auth copy SHALL stay consistent with `.kiro/steering/product.md` (clarity,
   agency, trust) and SHALL NOT promise out-of-scope capabilities (moving money,
   regulated financial advice).
4. THE implementation SHALL pass `pnpm --dir frontend lint` and
   `pnpm --dir frontend build`.

## Open questions / decisions for design
These are flagged for the Tech Lead / Solution Architect to resolve in
`design.md`; the requirements above are intentionally agnostic to them:
- **Token storage mechanism** (in-memory + `localStorage`/`sessionStorage`, or a
  cookie). Note the security trade-offs for a finance app handling a JWT; the
  requirement only mandates reload-survival and no logging of the token.
- **Auth screen shape**: a single screen toggling login/registration vs separate
  routes. Requirement 1 only mandates the home route is correctly gated.
- **Where the auth state lives** (React context/provider vs a small store) and
  whether a shared API client wraps the `Authorization` header and `401`
  handling from Requirements 4.3–4.4.

## Status
- Requirements: drafted, ready for review.
- Design (`design.md`): UI/UX sections drafted (Designer) — the auth screen
  follows the chat's visual language (tokens, borders, radii, focus, brand).
  Architecture sections (token storage, auth state, shared API client) pending
  Tech Lead.
- Tasks (`tasks.md`): not started (pending the architecture decisions).

Depends on: `user-authentication` (implemented), `agentic-chat-layout`
(implemented).
