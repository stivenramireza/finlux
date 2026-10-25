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
  authenticated chat endpoint, a Mastra-orchestrated Google Gemini agent, and
  user-scoped tools that read/write the caller's transactions **only** through
  the existing `TransactionsService`. Covers natural-language capture (with
  explicit confirmation), automatic categorization, and conversational Q&A over
  the user's own data, with conversation/message persistence and guardrails that
  enforce the product non-goals (no real-money movement, no regulated advice).
  Requirements drafted (PM); design complete and tasks written (Tech Lead):
  conversation sub-resource endpoints, own `conversation`/`message` TypeORM
  tables, Mastra + Google (`@ai-sdk/google`) agent, per-user tool isolation via
  `RequestContext`, and a confirmation-gated capture flow with no pending-state
  table. Ready to implement. Frontend wiring is a separate future spec.

### Planned (backlog, not yet written)
- `spending-summaries-and-trends`
- `proactive-insights-and-alerts`
- `deployment-docker-railway`
