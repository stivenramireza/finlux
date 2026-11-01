# Specs — Finlux

This folder holds **feature specs**. A spec is the structured way we build a
feature with Kiro, moving through three documents in order:

1. `requirements.md` — what the feature must do (user stories + acceptance
   criteria, ideally in EARS-style statements).
2. `design.md` — how it will be built (architecture, data models, interfaces,
   trade-offs).
3. `tasks.md` — the incremental, checkable implementation plan.

## Layout
```
.kiro/specs/
└── <feature-name>/        # kebab-case, e.g. transaction-categorization
    ├── requirements.md
    ├── design.md
    └── tasks.md
```

## Conventions
- One folder per feature, named in `kebab-case`.
- Keep the three documents in sync as the feature evolves.
- Specs may reference other files via `#[[file:<relative_path>]]`.

## Current specs
- `agentic-chat-layout` — static frontend layout of the agentic chat
  (requirements, design, tasks; implemented).
- `data-model-and-persistence` — core data model and persistence layer
  (requirements, design, tasks; implemented). ORM: TypeORM.
- `user-authentication` — registration, login, sessions, per-user isolation
  (requirements, design, tasks; implemented). Auth: email + bcrypt password,
  1h JWT access token, audit `session` table.
- `frontend-auth-integration` — wires the Next.js frontend to the auth backend:
  gated home route (login/registration when logged out; chat + log-out when
  logged in), token persistence, logout. Requirements drafted; design complete
  (Designer's UI/UX follows the chat's visual language; Tech Lead architecture
  decided: single-route toggle, in-memory + sessionStorage token, AuthProvider
  context, shared API client with status→message mapping and global 401
  handling). Tasks written; ready to implement.
- `transaction-http-api` — authenticated REST endpoints (GET/POST/PUT/DELETE)
  for the current user's transactions, layered on the existing user-scoped
  `TransactionsService` (`data-model-and-persistence`) and `JwtAuthGuard` +
  `@CurrentUser` (`user-authentication`). Requirements drafted (PM); design and
  tasks pending the Tech Lead.
- `conversational-agent-backend` — the backend brain of the chat: an
  authenticated chat endpoint and a Mastra-orchestrated Google Gemini agent. The
  agent's transaction tools are exposed by an **in-process MCP server** whose
  handlers are **HTTP clients of the transaction API** (`transaction-http-api`),
  forwarding the caller's JWT as `Authorization: Bearer` — the agent has **no
  direct database access** to transactions. Covers natural-language capture (with
  explicit confirmation), automatic categorization, and conversational Q&A over
  the user's own data, with conversation/message persistence (its own TypeORM
  tables) and guardrails that enforce the product non-goals (no real-money
  movement, no regulated advice). Requirements drafted (PM); design complete
  and tasks written (Tech Lead), incorporating the user's architecture decision
  (1a end-to-end JWT propagation, 2a in-process MCP) and the Layer 1 + Layer 3
  token-handling mitigations. **Implemented (Backend Engineer) and verified
  (Tech Lead): lint/format/build, 74 unit + 27 e2e green, migration round-trip
  confirmed.** Frontend wiring is a separate future spec.
- `frontend-chat-integration` — wires the Next.js chat UI (`agentic-chat-layout`)
  to the **implemented** `conversational-agent-backend` chat endpoints (verified
  in `backend/src/chat/`), consumed through the authenticated session + shared
  API client from `frontend-auth-integration`. Makes `MessageInput` functional, renders the live
  user/agent conversation (replacing the static samples), starts a conversation
  on the first message (`POST /conversations`) and continues it
  (`POST /conversations/:id/messages`), handles in-flight state and no duplicate
  turns, forwards the bearer token with global `401` handling, and shows safe
  non-disclosing errors (`400`/`404`/`502`/`503`/network). Streaming,
  conversation-history browsing, and rich transaction rendering are out of scope.
  Requirements drafted (PM); design complete (Tech Lead: shared `AuthApiClient`
  exposed via the auth context and reused through a thin typed `ChatApi` over
  `authedFetch`; dedicated `ChatProvider` for session state; optimistic user
  bubble reconciled from the server response; one fresh conversation per session;
  agent "typing" pending bubble). Tasks written (Tech Lead); ready to implement
  (Frontend Engineer). Note: fully satisfying the test requirement adds a
  frontend test runner (Vitest + RTL), flagged for the PM; the hard gate is
  `lint` + `build`.
- `password-reset` — self-service "forgot password" recovery for the
  unauthenticated user: a request step (enter email → if the account exists, a
  time-limited, single-use reset link is emailed) and a frontend reset landing to
  set a new password. Preserves Finlux's non-disclosure posture (the request
  response is identical whether or not the email is registered), resolves the
  user via the encrypted-email `email_bidx` blind index, stores only a hash of
  the reset token (like the `sessions` JWT hash), and enforces the existing
  password policy. Introduces Finlux's **first outbound-email capability**.
  Requirements drafted (PM); design complete and tasks written (Tech Lead,
  persisted by the PM because the Tech Lead role has no write tool here). Key
  decisions: Resend SDK `resend@6.37.0`; a dedicated `password_reset_tokens`
  table storing only a SHA-256 hash of the token (like `sessions`), single-use
  and superseded on re-request; reset-link lifetime fixed at **5 minutes in prod
  and dev** (PM decision); non-disclosing request response (identical for
  existing/non-existing, no timing oracle, no token/send for unknown emails);
  `400` for both weak-password and invalid/expired/used token (no oracle);
  pre-reset JWTs expire naturally (server-side revocation via
  `tokenVersion`/`passwordChangedAt` is a future enhancement); per-account
  cooldown + one-live-token cap for abuse/quota; dedicated frontend
  `/reset-password` landing plus a "forgot password" mode in `AuthScreen`. Email
  `from` uses Resend's sandbox `onboarding@resend.dev` in dev+prod for now
  (non-blocking; a verified Finlux domain is a later ops enhancement).
  **Implemented and verified (Backend + Frontend Engineers):** backend
  `lint`/`format:check`/`build`/`test` (171 unit) and frontend
  `lint`/`build`/`test` (38) green; `resend@6.37.0`; mailer faked in tests. Task
  6 (per-IP throttle) deferred (non-blocking). **DB verification closed:**
  migration `1730000004000` run/revert/run round-trip and backend `test:e2e
  password-reset` (6 tests) green against a live Postgres 18.1. Depends on
  `user-authentication`, `pii-encryption-at-rest`, `data-model-and-persistence`,
  `frontend-auth-integration` (all implemented).
- `password-history` — cross-cutting security rule: prevent reuse of a recent
  past password. Keeps a per-user `password_history` of **bcrypt hashes only**
  (never plaintext), populated at **registration** and on each **password
  reset**, and rejects (via bcrypt-compare) any new password matching the user's
  last **N = 5** (configurable; includes the current password). Integrates into
  the `password-reset` confirm step with a clear reuse message shown ONLY
  post-token (so the request step's non-disclosure is unchanged); a future
  in-session "change password" flow will reuse the same rule. Requirements
  drafted (PM); design complete and tasks written (Tech Lead, folding the
  Solution Architect's analysis; persisted by the PM as the Tech Lead role has no
  write tool here). Key decisions: reuse-check runs **before** consuming the
  reset token (a reuse rejection does not burn the token; the atomic consume
  stays the race barrier); the current password lives as a `password_history` row
  so the N-window is a single source (`ORDER BY created_at DESC LIMIT N`), pruned
  on insert; a standalone `PasswordHistoryService` (injects only its repo +
  `HashingService` + `ConfigService`, never `UsersService`, to avoid cycles)
  consumed by register (atomic user + first row) and the reset confirm; config
  `PASSWORD_HISTORY_DEPTH` (default 5); migration `1730000005000`. Documented
  trade-off: a valid live reset token enables a reuse oracle (match/no-match only,
  post-token) — accepted per Req 5.2. **Implemented and verified (Backend
  Engineer):** backend gates green (184 unit tests); DB-verified on live
  Postgres 18.1 (migration `1730000005000` run/revert/re-run round-trip; `test:e2e`
  44 across 6 files, incl. 6 new password-history and password-reset still
  intact); `HashingModule` extracted to remove the triplicated provider. Depends
  on `user-authentication`, `data-model-and-persistence`, `password-reset`
  (all implemented).

### Planned (backlog, not yet written)
- `spending-summaries-and-trends`
- `proactive-insights-and-alerts`
- `deployment-docker-railway`
