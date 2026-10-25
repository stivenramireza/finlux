# Design — Frontend Auth Integration

> Scope of this document. This is the **UI/UX design** for the auth integration,
> owned by the Designer. Its guiding constraint is that the auth screen must
> follow the **same UI/UX guidelines as the existing chat** (`agentic-chat-layout`):
> same design tokens, borders, radii, focus states, brand presentation, layout
> rhythm, and accessibility patterns — so login, registration, and chat read as
> one product.
>
> The **architecture decisions** (token storage mechanism, where auth state
> lives, shared API client, `401` handling) are **out of this document's scope**
> and are owned by the Tech Lead; they are listed under "Deferred to the Tech
> Lead (architecture)" at the end and must be resolved before implementation.

## Goal
Turn the home route into a gated experience using the same visual language as
the chat:
- **Unauthenticated** → an **auth screen** (login / registration) only.
- **Authenticated** → the existing `ChatShell` plus a **log-out** control only.

No new backend behavior. The look and feel are inherited from
`agentic-chat-layout`, not reinvented.

## Design tokens (reuse — do NOT add new ones)
The auth UI uses the existing single-source-of-truth tokens in
`frontend/src/app/globals.css`. No new colors, radii, or brand values are
introduced. Tokens consumed:

| Token / utility | Role in the auth screen |
|-----------------|-------------------------|
| `--brand` → `border-brand`, `text-brand`, `ring-brand` | primary green accent: card border, focus rings, primary button, links |
| `--brand-foreground` → `text-brand-foreground` | text/icon on a solid brand fill (submit button) |
| `--brand-tint` → `bg-brand-tint` | soft brand fill for the brand mark and subtle panels |
| `--surface` → `bg-surface` | secondary panels (e.g. the form-toggle bar), mirroring the header/input bars |
| `--background` / `--foreground` | base page and text colors |
| `--muted-foreground` → `text-muted-foreground` | supporting copy, labels, helper/validation hints |

Both light and dark schemes come for free because they are defined once on these
tokens; the auth screen must not hard-code hex values (Requirement 7.2, and the
brand-token rule from `agentic-chat-layout`).

## Visual language inherited from the chat
These are the concrete patterns lifted from the existing chat components so the
two surfaces match:

- **Container**: a centered, full-height, max-width card with a green border and
  rounded corners — the same shell treatment as `ChatShell`
  (`border border-brand/60`, `rounded-2xl`, `max-w-*`, `shadow-sm`,
  `max-h-[calc(100dvh-2rem)]`, outer `main` with `p-4 sm:p-6`). The auth card
  reuses this so a logged-out visitor sees the same framed surface they will see
  as chat.
- **Brand mark**: the rounded "F" mark from `ChatHeader` / `WelcomeState`
  (`border-brand`, `text-brand`, `bg-brand-tint`), used as the focal point above
  the form, echoing the welcome state.
- **Brand line**: the tagline "Your AI agent that brings clarity to your
  personal finances." presented like the `WelcomeState` focal copy
  (`text-balance`, `clarity` emphasized with `text-brand`), reused verbatim so
  copy stays on-brand and within scope (Requirement 7.2, 7.3).
- **Primary action**: a solid brand button matching the chat send button
  (`bg-brand text-brand-foreground rounded-full`, `hover:opacity-90`, the same
  `focus-visible:ring-2 ring-brand ring-offset-2 ring-offset-background`). The
  auth submit button uses the same treatment (full-width pill).
- **Inputs**: the chat input pattern — a bordered field
  (`border-brand`, rounded), neutral background, `placeholder:text-muted-foreground`,
  and a focus affordance consistent with the chat's
  `focus-within:ring-brand/40 focus-within:ring-4`. Each auth field is the same
  bordered control, stacked in a semantic form.
- **Dividers / secondary bars**: the login/registration toggle uses the header/
  input-bar treatment (`bg-surface/60`, `border-brand/30`), matching
  `ChatHeader` and `MessageInput`.
- **Focus states**: every interactive element shows a visible brand focus ring
  (`focus-visible:ring-brand` / `focus-within:ring-brand/40`), identical to the
  chat, so keyboard focus is obvious in both schemes (Requirement 7.1).
- **Radii & spacing rhythm**: `rounded-2xl` for the card, `rounded-full` for the
  primary button and pill controls, and the same `px-4/5`, `py-4/6`, `gap-4/5`
  spacing scale the chat uses.

## Screen structure
Gating logic (which screen shows) is wired by the Frontend Engineer per the
Tech Lead's state design; this document specifies the **presentation** of each
state.

```
home route
├── (auth state undetermined) → full-card loading state (no flash; Req 1.4)
├── (unauthenticated)         → <AuthScreen>         // login / registration only
└── (authenticated)           → <ChatShell> + <LogoutControl>  // chat + log out only
```

### AuthScreen (new, presentational)
A single centered card that mirrors `ChatShell`'s frame, containing:
1. **Brand block** — the "F" mark + brand line (reused from the welcome state),
   so the first screen is unmistakably Finlux.
2. **Form-mode toggle** — a `bg-surface/60` segmented control to switch between
   **Log in** and **Create account** (Requirement 3.1). A single screen toggling
   modes is the recommended shape (keeps one gated home route; the final choice
   of toggle-vs-routes is a Tech Lead item, but the visual pattern here is the
   toggle).
3. **Form** — a semantic `<form>` with stacked fields:
   - Login: email, password.
   - Registration: email, password, optional display name.
   Each field: a visible `<label>` associated via `htmlFor`/`id`, the inherited
   bordered input, `type="email"` / `type="password"` as appropriate
   (Requirement 7.1), `autoComplete` set correctly (`email`, `current-password`
   for login, `new-password` for registration).
4. **Primary submit** — the full-width brand pill button; shows an in-flight
   state (spinner/disabled) while a request is pending (Requirement 3.5).
5. **Message region** — an `aria-live="polite"` area for form-level errors
   (e.g. the generic "Invalid email or password", or "That email is already
   registered"), plus per-field validation messages linked via
   `aria-describedby` (Requirement 7.1).

### LogoutControl (authenticated state)
A clearly labelled, accessible control shown alongside the chat (Requirement
5.1). Design guidance for whoever composes it with the chat:
- Preferred placement: in the `ChatHeader`, right-aligned (the header currently
  has free space to the right of the brand block), as a compact button so the
  chat remains the focus.
- Styling: a **secondary** (outline) treatment rather than the solid brand fill,
  so it does not compete with the chat's primary send action — e.g.
  `border-brand/60 text-foreground rounded-full hover:bg-brand-tint`, with the
  same `focus-visible:ring-brand` ring.
- An explicit accessible name ("Log out"); if icon-only on narrow viewports, it
  must keep an `aria-label`.
- Note: placing it in `ChatHeader` means `ChatHeader` (or a small wrapper) gains
  an optional slot/prop for the control; the chat remains otherwise unchanged.

### Loading / undetermined state (Req 1.4)
While the persisted token is being read, render the card frame with a neutral,
centered loading indicator (brand-tinted), never the chat, so an unauthenticated
user never sees a flash of chat content. Visually this is the same card shell
with a small spinner in brand green.

## States to design for (parity with chat quality)
Each form must define all four states, styled with the inherited tokens:
- **Default / idle** — bordered fields, brand pill enabled.
- **In-flight** — submit disabled + progress indicator; inputs remain readable;
  duplicate submits prevented (Requirement 3.5).
- **Error** — form-level `aria-live` message (generic for login `401`; specific
  for duplicate-email on register) and per-field messages; non-password input is
  preserved (Requirement 2.6, 3.4). Error text uses a clearly distinguishable
  style while remaining AA-legible in both schemes.
- **Success** — transitions to the chat screen (no separate success copy needed;
  the state change is the feedback), per Requirement 2.4 / 3.3.

## Responsiveness
Follow the chat's responsive approach: the card is full-width with padding on
small screens (`p-4`) and constrained to a comfortable max-width on larger
screens (`sm:p-6`, `max-w-*`), remaining readable and usable on mobile and
desktop (mirrors `ChatShell`). Form fields are full-width within the card at all
breakpoints; the primary button is full-width for an easy tap target on mobile.

## Accessibility (parity with chat, Requirement 7.1)
- Semantic `<form>` with one `<label>` per field, associated by `id`/`htmlFor`.
- Validation messages linked to their field via `aria-describedby`; the
  form-level status uses `aria-live="polite"` (same pattern as the chat's
  `role="log"` live region).
- Password fields use `type="password"`; the show/hide toggle (if added) is a
  real `<button>` with an accessible name and does not trap focus.
- Visible brand focus ring on every interactive element (inherited
  `focus-visible:ring-brand`), sufficient contrast in light and dark.
- The brand mark is `aria-hidden` (decorative), consistent with the chat; the
  accessible name of the screen comes from a real heading.
- Headings: the auth card uses an `<h1>`/`<h2>` consistent with the chat's
  heading usage so the landmark/heading structure stays coherent when toggling
  to the chat (which already renders the `Finlux` `<h1>` in its header).

## Copy guidance (Requirement 7.3)
Reuse the chat's voice: clarity, agency, trust. Allowed/suggested microcopy:
- Brand line: the existing tagline, verbatim.
- Login error (generic): "Invalid email or password."
- Duplicate email: "That email is already registered. Try logging in instead."
- No copy may promise moving money or regulated financial advice (product
  non-goals). Button labels: "Log in", "Create account", "Log out".

## Component inventory (new, under `frontend/src/components/auth/`)
Presentational components, mirroring the `components/chat/` structure and naming
(kebab-case files):
- `auth-screen.tsx` — the gated card composing brand block + toggle + form.
- `auth-brand.tsx` — the "F" mark + brand line (may extract the shared piece
  from `welcome-state`/`chat-header` to avoid duplicated brand markup).
- `login-form.tsx`, `register-form.tsx` — the two semantic forms (presentation +
  field markup; data/submit wiring is the Frontend Engineer's).
- `auth-field.tsx` — a labeled, brand-bordered input matching the chat input.
- `logout-button.tsx` — the secondary outline control for the chat header.

These are presentation only: they expose props (values, error strings,
`isSubmitting`, `onSubmit`) that the Frontend Engineer binds to the auth state /
API client defined by the Tech Lead.

## Verification (UI/UX)
- `pnpm --dir frontend lint` and `pnpm --dir frontend build` pass
  (Requirement 7.4).
- Manual review: auth card uses the same green border / radii / brand mark as
  the chat; focus rings visible on all fields and buttons in light and dark;
  layout readable on narrow and wide viewports; no chat flash before the auth
  state resolves; logged-in view shows chat + a single clearly labelled log-out
  control and no auth form; logged-out view shows only the auth screen.
- No new design tokens were introduced; all green comes from `--brand`
  and its derivatives.

# Architecture (Tech Lead decisions)

> Everything below is **decided by the Tech Lead** and is authoritative for
> implementation. The Frontend Engineer implements against these decisions and
> does not re-open them. These sections replace the earlier "Deferred to the
> Tech Lead" list; the UI/UX sections above remain owned by the Designer and are
> unchanged.

## Backend contract — verified status codes
Verified directly against the implemented backend (`backend/src/auth/
auth.controller.ts`, `auth.service.ts`):

| Call | Success | Failure(s) |
|------|---------|------------|
| `POST /auth/register` | **201** → `PublicUser` (`{ id, email, displayName, createdAt, updatedAt }`, no `password`) | **409** `ConflictException` = duplicate email; **400** global `ValidationPipe` = malformed/invalid body (e.g. weak password, bad email) |
| `POST /auth/login` | **200** → `{ accessToken, user: PublicUser }` | **401** `UnauthorizedException` = invalid credentials (generic, no field disclosure); **400** = malformed body |

Note: the `requirements.md` "Backend contract" bullet loosely groups `409` under
"malformed input" — that is imprecise. `409` is specifically a **conflict
(duplicate email)**, distinct from `400` validation errors. This design uses the
precise mapping in the table above.

### Decision A — Status-code → message mapping (owned by the API client)
The gap the architect flagged: the UI distinguishes "duplicate email" from other
errors, but nothing owned the mapping. It is owned by the **shared API client**,
which translates HTTP failures into a small typed error the forms render. The
forms never inspect raw status codes.

Typed result the auth calls return to the forms:
```ts
type AuthError =
  | { kind: 'duplicate-email' }      // register 409
  | { kind: 'invalid-credentials' }  // login 401
  | { kind: 'validation'; message?: string } // 400
  | { kind: 'network' }              // fetch/transport failure, no HTTP status
  | { kind: 'unknown'; status?: number };     // anything else (5xx, etc.)
```
Mapping:
- `register`: `201` → success (then **auto-login**, Req 2.4); `409` →
  `duplicate-email` → copy "That email is already registered. Try logging in
  instead."; `400` → `validation` (keep non-password input, Req 2.6); other →
  `unknown`.
- `login`: `200` → `{ accessToken, user }`; `401` → `invalid-credentials` →
  single generic copy "Invalid email or password." (no field disclosure,
  Req 3.4); `400` → `validation`; other → `unknown`.
- Any transport-level failure (offline, DNS, CORS, timeout) → `network`, shown
  as a generic retryable message. This keeps the generic-401 non-disclosure
  intact (a network failure is never reported as "invalid credentials").

The client reads the backend base URL from config (Decision E) and sets
`Content-Type: application/json`; it never logs request bodies or tokens
(Req 4.5).

### Decision B — Auth screen shape: single route with in-card toggle (RESOLVED)
The home route (`/`) remains the single gated entry point. Login vs registration
is a **client-side mode toggle inside `AuthScreen`** (the Designer's segmented
control), not separate `/login` / `/register` routes.

Rationale: the requirements gate the **home** route (Req 1) and explicitly place
multi-page routing out of scope. With only two flows, separate routes would add
routing, duplicate the gating decision, and complicate the global `401 → auth`
redirect — for no user benefit. The toggle keeps one place where auth state is
evaluated and one component to return to after a `401` or logout. This closes
the open "auth screen shape" question in favor of the Designer's recommended
toggle.

### Decision C — Token storage: in-memory + `sessionStorage` (RESOLVED)
The access token lives in **React state (in-memory) as the source of truth**,
mirrored to **`sessionStorage`** for reload survival within the browser tab.

Trade-offs considered for a 1-hour, access-only JWT with **no refresh token and
no server-side revocation** (per `user-authentication`):
- **`localStorage`**: survives tab close and across tabs, but a longer-lived
  XSS-readable surface. For a finance app we minimize the token's at-rest
  lifetime.
- **Cookie (`HttpOnly`)**: would mitigate XSS read, but the backend issues a
  **bearer JWT** consumed via `Authorization: Bearer` (verified: `JwtStrategy`
  uses `ExtractJwt.fromAuthHeaderAsBearerToken()`), not a cookie. Using a cookie
  would require backend changes (out of scope) and introduce CSRF considerations.
  Rejected.
- **`sessionStorage`** (chosen): survives reload (Req 4.1) but is cleared when
  the tab closes, bounding exposure to a single tab/session — a reasonable
  default for sensitive data, and consistent with the short 1h token. XSS risk
  is the same class as `localStorage` while the browser tab is open; we reduce
  the persistence window, and standard XSS hygiene (React escaping, no
  `dangerouslySetInnerHTML`, no injecting the token into the DOM) applies.

Requirement mapping:
- **4.1 (survive reload)**: on mount, the provider reads `sessionStorage`,
  validates the token, and rehydrates in-memory state.
- **4.2 (expired token → unauthenticated)**: the provider decodes the JWT `exp`
  claim (base64url-decode the payload; no signature verification needed on the
  client — the backend is the authority) and treats `exp <= now` (with a small
  clock-skew margin) as unauthenticated, clearing storage. A malformed token is
  treated the same.
- **4.5 (never log the token)**: the token is never passed to `console.*` or any
  telemetry; it is read/written only by the provider and the API client.

### Decision D — Auth state: a React Context provider (RESOLVED)
A single **`AuthProvider`** (React Context) holds the auth state and is the one
subscription point for the gated render (Req 1). It exposes:
```ts
interface AuthContextValue {
  status: 'undetermined' | 'authenticated' | 'unauthenticated';
  user: PublicUser | null;
  login(email, password): Promise<AuthError | null>;
  register(input): Promise<AuthError | null>;   // on success, auto-logs in
  logout(): void;                                // client-side only (Req 5.4)
  getToken(): string | null;                     // for the API client
}
```
- **No-flash initial load (Req 1.4)**: `status` starts as **`undetermined`**
  until the provider has read and validated the persisted token on mount
  (client-only effect). The gated render shows the Designer's **loading card**
  while `undetermined`, then `AuthScreen` or `ChatShell + LogoutControl`. The
  chat is never rendered in `undetermined`/`unauthenticated`, so an
  unauthenticated user never sees a chat flash.
- Because the gate depends on client-only state (`sessionStorage`), the gated
  page/segment is a **Client Component**; the `AuthProvider` wraps it. The static
  chat and auth presentation components remain as they are.

### Decision E — Global `401` handling (RESOLVED, Req 4.4)
The `401 → discard token → auth screen` transition is **global and centralized**
in the shared API client together with the `AuthProvider`, not in any form:
- The API client is created with access to the provider's `getToken()` (for the
  `Authorization: Bearer <token>` header, Req 4.3) and an `onUnauthorized()`
  callback.
- WHERE any **authenticated** request returns `401`, the client invokes
  `onUnauthorized()`, which clears the token (in-memory + `sessionStorage`) and
  sets `status = 'unauthenticated'`. The gated render then shows the **same**
  `AuthScreen` component — this is not a new screen state, just the normal
  unauthenticated render.
- The auth endpoints themselves (`login`/`register`) are exempt from this global
  behavior: their `401`/`409`/`400` are handled as form errors per Decision A,
  not as a session expiry.

### Decision F — Configuration (RESOLVED, Req 6)
- Backend base URL from a **`NEXT_PUBLIC_API_BASE_URL`** environment variable
  (must be `NEXT_PUBLIC_`-prefixed to be readable in the browser under Next.js).
  No hard-coded URL.
- Committed **`frontend/.env.example`** documents the key with no value;
  `frontend/.env*` stays git-ignored (confirm the root `.gitignore` already
  ignores `frontend/.env`). The API client fails fast with a clear error if the
  variable is missing at runtime.

## Verification criteria (architecture — beyond lint/build)
In addition to the Designer's UI/UX checks and `pnpm --dir frontend lint` /
`build` (Req 7.4), the implementation MUST be verified against:
- **Req 1.4 — no chat flash**: with a slow/empty `sessionStorage`, the initial
  render shows the loading card (never the chat) before resolving to the auth
  screen.
- **Req 4.1 — reload survival**: after login, a full page reload keeps the user
  authenticated (token rehydrated from `sessionStorage`).
- **Req 4.2 — expired token**: a persisted token whose `exp` is in the past
  resolves to the auth screen and is cleared from storage.
- **Req 4.4 — mid-session 401**: an authenticated call returning `401` returns
  the user to the auth screen and clears the token.
- **Req 4.5 — no token logging**: grep/review confirms the token/credentials are
  never written to `console.*` or telemetry.
- **Req 5 — logout**: activating logout clears the token and shows the auth
  screen with **no** network call to the backend (client-side only).
- **Decision A — error mapping**: `409` renders the duplicate-email copy; login
  `401` renders the single generic message; a network failure renders a
  distinct retryable message (never "invalid credentials").

## Status
- UI/UX design: drafted (Designer).
- Architecture sections (contract mapping, storage, state, API client, 401,
  config, verification): **drafted and decided (Tech Lead).**
- Tasks (`tasks.md`): ready to be written (Tech Lead) against these decisions.

Depends on: `user-authentication` (implemented), `agentic-chat-layout`
(implemented).
