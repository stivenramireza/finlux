# Tasks — Frontend Auth Integration

Implementation plan. Frontend-only (`frontend/`), Next.js 16.4.3 + React 19,
TypeScript, Tailwind v4, pnpm under Node 24.22.1. Implements the Designer's
UI/UX and the Tech Lead's architecture decisions (A–F) in `design.md`. Reuses
existing design tokens — **no new tokens**. Consumes the implemented
`user-authentication` backend; no backend changes.

Prefer `package.json` scripts: `pnpm --dir frontend lint`,
`pnpm --dir frontend build`, `pnpm --dir frontend format:check`.

- [x] 1. Add backend base URL configuration
  - Create committed `frontend/.env.example` documenting
    `NEXT_PUBLIC_API_BASE_URL` (no value). Confirm `frontend/.env*` is
    git-ignored (extend the root `.gitignore` only if it is not already).
  - Add a tiny config accessor that reads `NEXT_PUBLIC_API_BASE_URL` and throws
    a clear error if missing at runtime.
  - _Requirements: 6.1, 6.2 · Design: Decision F_

- [x] 2. Define shared auth types and the status→error mapping
  - Add `src/lib/auth/types.ts`: `PublicUser`, `LoginResult`
    (`{ accessToken, user }`), the `AuthError` union
    (`duplicate-email | invalid-credentials | validation | network | unknown`),
    and register/login input types.
  - _Requirements: (contract) 2.5, 2.6, 3.4 · Design: Decision A_

- [x] 3. Implement the shared API client
  - `src/lib/auth/api-client.ts`: a fetch wrapper taking the base URL, a
    `getToken()` accessor, and an `onUnauthorized()` callback. Sets
    `Content-Type: application/json`; attaches `Authorization: Bearer <token>`
    on authenticated calls (Req 4.3). Maps HTTP results to `AuthError` per
    Decision A: register `201`→success, `409`→`duplicate-email`,
    `400`→`validation`; login `200`→`LoginResult`, `401`→`invalid-credentials`,
    `400`→`validation`; transport failure→`network`; else→`unknown`. For
    **authenticated** requests, a `401` invokes `onUnauthorized()`; the auth
    endpoints themselves are exempt. Never logs bodies or tokens (Req 4.5).
  - _Requirements: 3.4, 4.3, 4.4, 4.5 · Design: Decisions A, E_

- [x] 4. Implement JWT expiry + token storage helpers
  - `src/lib/auth/token-storage.ts`: read/write/clear the token in
    `sessionStorage` (guarded for SSR / no-window). `src/lib/auth/jwt.ts`:
    base64url-decode the payload and return `exp`; `isExpired(token, skew)`
    treats missing/malformed `exp` or `exp <= now` as expired. No signature
    verification (backend is the authority).
  - _Requirements: 4.1, 4.2 · Design: Decision C_

- [x] 5. Implement the AuthProvider (React Context)
  - `src/lib/auth/auth-provider.tsx` (Client Component): holds
    `status: 'undetermined' | 'authenticated' | 'unauthenticated'`, `user`, and
    the in-memory token (source of truth, mirrored to `sessionStorage`). On
    mount, rehydrate from storage and validate `exp` (Req 4.2); start
    `undetermined` to avoid any chat flash (Req 1.4). Expose `login`,
    `register` (auto-logs in on success, Req 2.4), `logout` (client-side only,
    clears token, no backend call — Req 5.3, 5.4), and `getToken`. Wire the API
    client's `onUnauthorized` to clear state → `unauthenticated` (Req 4.4).
    Never log the token (Req 4.5).
  - _Requirements: 1.3, 1.4, 2.4, 4.1, 4.2, 4.4, 4.5, 5.3, 5.4 · Design: Decisions C, D, E_

- [x] 6. Extract the shared brand block
  - `src/components/auth/auth-brand.tsx`: the "F" mark + brand line, factored
    from the existing `welcome-state`/`chat-header` markup so auth and chat
    share one brand presentation. Reuse `--brand`, `--brand-tint`,
    `text-brand`; introduce no new tokens. Keep the mark `aria-hidden` and the
    accessible name on a real heading.
  - _Requirements: 7.2, 7.3 · Design: UI/UX "Visual language", "Accessibility"_

- [x] 7. Build the AuthField input
  - `src/components/auth/auth-field.tsx`: a labeled, brand-bordered input
    matching the chat input (`border-brand`, rounded, `focus-within` brand
    ring). Associates `<label htmlFor>`/`id`, supports `type` (email/password),
    `autoComplete`, and an `aria-describedby`-linked validation message slot.
  - _Requirements: 7.1 · Design: UI/UX "Inputs", "Accessibility"_

- [x] 8. Build the login and registration forms
  - `src/components/auth/login-form.tsx` (email, password) and
    `register-form.tsx` (email, password, optional display name). Semantic
    `<form>`; client-side validation — valid email, and on register the full
    password policy (≥8, upper, lower, digit, special — Req 2.2). Full-width
    brand pill submit with in-flight disabled state + progress; prevent
    duplicate submits (Req 3.5). Form-level `aria-live` region renders the
    mapped `AuthError` copy (generic for `invalid-credentials`; specific for
    `duplicate-email`); preserve non-password input on error (Req 2.6, 3.4).
    Correct `autoComplete` (`current-password` vs `new-password`).
  - _Requirements: 2.1, 2.2, 2.5, 2.6, 3.1, 3.4, 3.5, 7.1 · Design: UI/UX "AuthScreen", Decision A_

- [x] 9. Assemble the AuthScreen (single route, toggle)
  - `src/components/auth/auth-screen.tsx`: the centered, green-bordered card
    mirroring `ChatShell`'s frame, composing `AuthBrand` + the `bg-surface/60`
    login/registration mode toggle + the active form. Toggling modes announces
    the change for assistive tech. Calls `login`/`register` from the provider.
  - _Requirements: 3.1, 7.1, 7.2 · Design: Decision B, UI/UX "AuthScreen"_

- [x] 10. Build the logout control
  - `src/components/auth/logout-button.tsx`: a secondary outline control
    (`border-brand/60`, `rounded-full`, `hover:bg-brand-tint`, brand focus
    ring), accessible name "Log out". Calls the provider's `logout`.
  - _Requirements: 5.1, 5.2 · Design: UI/UX "LogoutControl"_

- [x] 11. Add an optional logout slot to the chat header
  - Extend `ChatHeader` with an optional slot/prop (e.g. `action`) rendered
    right-aligned, to host `LogoutButton` when authenticated. The chat is
    otherwise unchanged; no slot → identical to today.
  - _Requirements: 5.1 · Design: UI/UX "LogoutControl"_

- [x] 12. Implement the gated home route
  - `src/components/auth/loading-card.tsx`: the card-framed, brand-tinted
    loading state. Add a Client Component gate (e.g.
    `src/components/auth/auth-gate.tsx`) that switches on provider `status`:
    `undetermined` → `LoadingCard` (never chat, Req 1.4); `unauthenticated` →
    `AuthScreen`; `authenticated` → `ChatShell` with `LogoutButton` in the
    header. Wrap the app in `AuthProvider` (in `layout.tsx` or a client
    boundary) and render the gate from `src/app/page.tsx`.
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 5.1 · Design: Decisions D, E, UI/UX "Screen structure"_

- [x] 13. Accessibility and responsiveness pass
  - Verify: one `<label>` per field, validation linked via `aria-describedby`,
    form status via `aria-live="polite"`, password inputs `type="password"`,
    visible brand focus ring on every control in light and dark, the brand mark
    `aria-hidden`, coherent heading structure across auth↔chat, and that the
    card is readable/usable on narrow and wide viewports.
  - _Requirements: 7.1, 7.2 · Design: UI/UX "Accessibility", "Responsiveness"_

- [~] 14. Manual verification of architecture criteria (code-complete; runtime
      checks pending a live backend + browser — see note)
  - Confirm: no chat flash with empty/slow `sessionStorage` (1.4); reload keeps
    the user logged in (4.1); a past-`exp` persisted token resolves to the auth
    screen and is cleared (4.2); a mid-session authenticated `401` returns to
    the auth screen and clears the token (4.4); logout clears the token with
    **no** backend call (5.2, 5.4); `409` shows the duplicate-email copy and
    login `401` shows the single generic message; a network failure shows a
    distinct retryable message (never "invalid credentials"); grep confirms the
    token/credentials are never sent to `console.*` (4.5).
  - _Requirements: 1.4, 2.5, 3.4, 4.1, 4.2, 4.4, 4.5, 5.2, 5.4 · Design: "Verification criteria"_

- [x] 15. Verify build, lint, and format
  - `pnpm --dir frontend lint`, `pnpm --dir frontend build`, and
    `pnpm --dir frontend format:check` pass; fix any issues. Confirm the gated
    screens render and the green borders/brand match the chat.
  - _Requirements: 7.4_

## Notes
- Scope guard: the chat remains static (`agentic-chat-layout`); this spec only
  gates access and adds logout. No real messaging/agent behavior.
- `requirements.md` has a small imprecision (it groups `409` under "malformed
  input"); the authoritative mapping is `design.md` Decision A (`409` =
  duplicate email, distinct from `400`). Flagged for the Product Manager; not
  edited here (requirements are PM-owned).

Depends on: `user-authentication` (implemented), `agentic-chat-layout`
(implemented).
