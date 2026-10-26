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

### Planned (backlog, not yet written)
- `spending-summaries-and-trends`
- `proactive-insights-and-alerts`
- `deployment-docker-railway`
