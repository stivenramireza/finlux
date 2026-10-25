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

### Planned (backlog, not yet written)
- `natural-language-transaction-capture`
- `transaction-categorization`
- `conversational-qa`
- `spending-summaries-and-trends`
- `proactive-insights-and-alerts`
- `deployment-docker-railway`
