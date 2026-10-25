# Requirements — Conversational Agent Backend

## Overview
Expose Finlux's **AI agent over HTTP** so an authenticated user can hold a
natural-language conversation about their personal finances. This is the
backend brain behind the chat UI: it receives a user message, reasons over the
user's own financial data with a Google Gemini model orchestrated by Mastra, and
returns a grounded, traceable reply.

This spec adds the **agent + chat HTTP layer only**. It builds additively on:

- `data-model-and-persistence` (implemented) — the `transaction` table and the
  fully **user-scoped `TransactionsService`** (`create`, `findAll` with
  optional `type`/date filters, `findOne`/`findOneOrFail`, `update`, `remove`),
  where every method takes `userId` and applies it in the `WHERE` clause.
- `user-authentication` (implemented) — the reusable `JwtAuthGuard`, the
  `@CurrentUser('userId')` decorator, and the stateless 1-hour bearer JWT.
- `transaction-http-api` (specced) — the REST surface for structured
  transactions. The agent does **not** bypass the service: it reaches the same
  user-scoped `TransactionsService` through tools.
- `agentic-chat-layout` (implemented) — the static chat UI that will later be
  wired to this backend. Wiring the frontend to this API is a **separate** spec.

It realizes, from the product's initial scope, the conversational pillars:
record transactions in natural language (with confirmation), automatic
categorization at capture time, and conversational Q&A over the user's finances.

## Terminology
- **User / caller**: the authenticated login identity, resolved from the JWT as
  `userId` (`user-authentication`). Not a financial account.
- **Agent**: the Mastra-orchestrated Gemini agent that reasons over the caller's
  data using tools. It never acts outside the caller's own data.
- **Tool**: a typed function the agent may call (e.g. "list the caller's
  transactions", "create a transaction"). Every tool is user-scoped and routes
  through `TransactionsService`.
- **Conversation**: an ordered exchange of user and agent messages. A
  conversation belongs to exactly one user.
- **Message**: a single turn in a conversation, authored by the `user` or the
  `agent`.
- **Pending action**: a state-changing operation (e.g. creating a transaction)
  that the agent has prepared from the user's words but that has **not** been
  applied, awaiting explicit user confirmation.

## Scope
In scope:
- An authenticated HTTP endpoint (chat) that accepts a user message within a
  conversation and returns the agent's reply.
- A Mastra agent backed by a Google Gemini model (provider `@ai-sdk/google`),
  configured from the backend environment.
- Agent **tools** that read and write the caller's transactions **only** through
  the user-scoped `TransactionsService` (list/query, read one, create, update,
  delete), plus read-only summary/aggregation over the caller's data.
- **Natural-language transaction capture with confirmation**: the agent extracts
  amount, type (income/expense), currency, date, description, and a **category
  label**, presents a structured summary, and only persists after the user
  explicitly confirms.
- **Automatic categorization** of a captured transaction (a suggested category
  the user can accept or correct before confirming).
- **Conversational Q&A** over the caller's finances (e.g. "how much did I spend
  on food last month?"), answered strictly from the caller's stored data via
  tools, with traceability to the underlying transactions.
- Persisting conversations and messages per user, and listing/continuing a
  conversation.
- Server-side validation, per-user isolation, safe error handling, and a
  guardrail layer that enforces the product non-goals.

Out of scope:
- Any frontend/UI work or wiring the Next.js chat to this API (a later
  `frontend-chat-integration` spec).
- The data model for transactions, migrations, or the service scoping logic
  (owned by `data-model-and-persistence`).
- Authentication, token issuance, or session handling
  (owned by `user-authentication`).
- The plain structured transaction REST endpoints (owned by
  `transaction-http-api`); this spec consumes the same service, not that
  controller.
- Proactive/scheduled insights and alerts, spending summaries dashboards, trends
  visualizations (later specs: `spending-summaries-and-trends`,
  `proactive-insights-and-alerts`). This spec only answers **on request** within
  a conversation.
- Streaming/token-by-token responses, voice, and multi-language tuning beyond
  returning the agent's text (may be a later enhancement).
- Multi-currency conversion / FX (explicitly not modeled per
  `data-model-and-persistence`).
- **Moving real money**, executing payments/transfers, or connecting to banks or
  financial institutions (product non-goal).
- **Regulated financial, tax, or legal advice** (product non-goal).

## Backend contract this spec relies on (consumed, not defined here)
- `TransactionsService` is already user-scoped and is the **only** way the agent
  reads or mutates financial data; every tool MUST pass the caller's `userId`
  and MUST NOT run unscoped or raw queries.
- A transaction's fields are: `id` (uuid), `userId` (uuid, owner), `amount`
  (precise decimal, represented as a **string** — never a float), `type`
  (`income` | `expense`), `currency` (`COP` | `USD`), `date` (`YYYY-MM-DD`
  calendar day), `description` (optional text or null), `createdAt`,
  `updatedAt`.
- `JwtAuthGuard` rejects requests without a valid, non-expired bearer token with
  `401`; `@CurrentUser('userId')` yields the caller's id.
- The LLM provider is **Google Gemini** via `@ai-sdk/google`, orchestrated by
  **Mastra**, per `.kiro/steering/tech.md`. The Google API key is read from the
  environment (e.g. `GOOGLE_GENERATIVE_AI_API_KEY`), referenced by key name and
  never committed.

## Requirements

### Requirement 1 — Authenticated chat endpoint
**User story:** As a user, I want to send a message to the Finlux agent and get a
reply, so that I can manage and understand my finances by talking to it.

Acceptance criteria (EARS):
1. THE SYSTEM SHALL protect every chat/conversation endpoint with the existing
   `JwtAuthGuard`.
2. WHEN a request carries a valid, non-expired bearer token, THE SYSTEM SHALL
   resolve the caller's `userId` via `@CurrentUser('userId')` and scope the
   entire turn — conversation, messages, and every tool call — to that user.
3. IF a request has no token, or an invalid/expired token, THEN THE SYSTEM SHALL
   deny access with `401 Unauthorized` and SHALL NOT invoke the agent.
4. WHEN the caller posts a valid chat message, THE SYSTEM SHALL run the agent and
   respond with the agent's reply and the identifiers needed to continue the
   conversation (e.g. the conversation id and the created message(s)).
5. THE SYSTEM SHALL NOT accept a user identifier from the request body, query, or
   path to determine ownership; ownership SHALL be derived solely from the token.

### Requirement 2 — Conversation and message persistence
**User story:** As a user, I want my conversation to be remembered, so that I can
continue it and the agent has context.

Acceptance criteria (EARS):
1. THE SYSTEM SHALL persist conversations and their messages, each conversation
   owned by exactly one user (FK to `user`, scoped like all financial data).
2. WHEN the caller sends a message without a conversation id, THE SYSTEM SHALL
   create a new conversation owned by the caller and attach the message to it.
3. WHEN the caller sends a message with a conversation id they own, THE SYSTEM
   SHALL append the turn to that conversation and provide prior turns as context
   to the agent.
4. IF the referenced conversation id is not owned by the caller (does not exist
   OR belongs to another user), THEN THE SYSTEM SHALL respond `404 Not Found` and
   SHALL NOT disclose whether it exists for a different user.
5. THE SYSTEM SHALL store each message with its author role (`user` | `agent`),
   its text, and a timestamp, preserving turn order.
6. THE SYSTEM SHALL allow the caller to list their own conversations and fetch
   the messages of a conversation they own, scoped to the caller.

### Requirement 3 — Tool-grounded reasoning over the caller's data
**User story:** As a user, I want the agent's answers to reflect my actual
recorded data, so that I can trust what it tells me.

Acceptance criteria (EARS):
1. THE SYSTEM SHALL answer questions about the caller's finances **only** from the
   caller's stored transactions, obtained through user-scoped tools that route
   through `TransactionsService`.
2. THE SYSTEM SHALL pass the caller's `userId` to every tool invocation and SHALL
   NOT let the agent read, aggregate, or mutate any other user's data.
3. WHEN the agent makes a claim about the caller's money (a total, a count, a
   list), THE SYSTEM SHALL base it on tool results, so the claim is traceable to
   the underlying transactions (experience principle: explain reasoning).
4. IF the caller asks something that cannot be answered from the stored data,
   THEN THE SYSTEM SHALL say so plainly rather than fabricate figures.
5. THE SYSTEM SHALL preserve monetary precision end to end, treating `amount` as
   a decimal string and never converting it to a floating-point number.

### Requirement 4 — Natural-language transaction capture with confirmation
**User story:** As a user, I want to record a transaction by describing it in
plain language, so that bookkeeping feels like a conversation.

Acceptance criteria (EARS):
1. WHEN the caller describes a transaction in natural language (e.g. "I spent 20
   on lunch today"), THE SYSTEM SHALL extract a structured draft with `amount`,
   `type` (income/expense), `currency`, `date`, `description`, and a suggested
   `category`, and SHALL present that draft back to the caller for confirmation.
2. THE SYSTEM SHALL NOT persist the transaction until the caller **explicitly
   confirms**; a described-but-unconfirmed transaction is a pending action only.
3. WHEN the caller confirms the draft, THE SYSTEM SHALL create the transaction via
   `TransactionsService.create(userId, …)` and confirm success with the stored
   result.
4. WHEN the caller corrects a field before confirming (e.g. the amount, date, or
   category), THE SYSTEM SHALL update the draft accordingly and re-present it.
5. WHEN the caller declines or abandons the draft, THE SYSTEM SHALL discard the
   pending action and persist nothing.
6. IF a required field cannot be determined from the caller's words (e.g. the
   currency or the amount is ambiguous), THEN THE SYSTEM SHALL ask a clarifying
   question rather than guess or persist an invalid record.
7. THE captured fields SHALL satisfy the same domain rules as the data model and
   `transaction-http-api`: `amount` a positive decimal string, `type` in
   `income` | `expense`, `currency` in `COP` | `USD`, `date` a valid `YYYY-MM-DD`
   calendar day; IF the resolved draft would violate these, THEN THE SYSTEM SHALL
   not persist it and SHALL ask the caller to clarify.

### Requirement 5 — Automatic categorization
**User story:** As a user, I want my transactions categorized for me, so that I
get clarity without manual tagging.

Acceptance criteria (EARS):
1. WHEN the agent drafts a captured transaction, THE SYSTEM SHALL propose a
   category label derived from the description/context.
2. THE SYSTEM SHALL let the caller accept or override the suggested category as
   part of the confirmation step (Requirement 4.4).
3. WHERE the model cannot confidently categorize, THE SYSTEM SHALL fall back to a
   neutral default (e.g. "uncategorized") rather than block capture.
4. THE category SHALL be stored in a way compatible with the current data model
   (the model has no dedicated category column — see "Open questions / decisions
   for design" for where the label lives), without requiring an unscoped schema
   change in this spec unless design decides otherwise.

### Requirement 6 — Conversational Q&A and summaries on request
**User story:** As a user, I want to ask how my money is doing, so that I get
clear answers in the moment.

Acceptance criteria (EARS):
1. WHEN the caller asks a quantitative question over a time range and/or type
   (e.g. "how much did I spend on food last month?"), THE SYSTEM SHALL compute
   the answer from the caller's transactions via tools and respond with the
   figure and a brief, grounded explanation.
2. WHERE a question implies a filter the data model supports (type, date range),
   THE SYSTEM SHALL apply it through the existing user-scoped query, consistent
   with `transaction-http-api` filter semantics.
3. WHEN the caller has no matching transactions, THE SYSTEM SHALL say there is
   nothing recorded for that query rather than return a misleading zero without
   context.
4. THE SYSTEM SHALL keep currency explicit in answers and SHALL NOT sum or
   compare across different currencies as if interchangeable (no FX).

### Requirement 7 — Guardrails and product non-goals
**User story:** As a user, I want the agent to stay within safe, honest bounds,
so that I can trust Finlux with sensitive data.

Acceptance criteria (EARS):
1. THE SYSTEM SHALL NOT move real money, initiate payments or transfers, or
   connect to banks/financial institutions; no tool SHALL expose such an action.
   IF the caller requests it, THEN THE SYSTEM SHALL clearly decline and explain
   that Finlux only records user-entered data.
2. THE SYSTEM SHALL NOT provide regulated financial, tax, or legal advice; WHEN
   asked, THE SYSTEM SHALL offer informational clarity about the caller's own
   data and decline to give regulated advice.
3. THE SYSTEM SHALL only ever perform state changes (create/update/delete a
   transaction) through the user-scoped tools, and create SHALL require the
   explicit confirmation of Requirement 4.
4. THE SYSTEM SHALL treat all conversation content and financial data as
   sensitive PII and SHALL NOT log message bodies, amounts, descriptions,
   credentials, or tokens.
5. THE SYSTEM SHALL be resilient to prompt-injection in user text: content inside
   a user message SHALL NOT be able to escalate the agent beyond its user-scoped
   tools or the non-goals above (e.g. it cannot make the agent read another
   user's data or invent a money-movement capability).

### Requirement 8 — Validation, errors, and resilience
**User story:** As any client, I want predictable, safe behavior, so that I can
integrate reliably without leaking sensitive details.

Acceptance criteria (EARS):
1. THE SYSTEM SHALL validate and sanitize the chat request body (message text and
   optional conversation id) using the backend's global validation, rejecting
   malformed input with `400 Bad Request`.
2. THE SYSTEM SHALL bound the message length and reject oversized input with
   `400`, to protect the model and the service.
3. IF the model/provider call fails or times out, THEN THE SYSTEM SHALL return a
   safe error (e.g. `502`/`503` with a generic message) and SHALL NOT persist a
   misleading agent reply; any pending action SHALL remain unapplied.
4. THE SYSTEM SHALL NOT include stack traces, SQL, provider internals, API keys,
   or tokens in error responses.
5. THE SYSTEM SHALL use parameterized access via TypeORM/`TransactionsService`
   (no string-interpolated queries) for all persistence.

### Requirement 9 — Stack, configuration, and quality
**User story:** As a developer, I want the agent backend to align with the
project's stack and pass its checks.

Acceptance criteria (EARS):
1. THE implementation SHALL align with `.kiro/steering/tech.md`: NestJS backend,
   TypeORM, ESM with `.js` import specifiers, Mastra orchestration, and the
   Google (`@ai-sdk/google`) Gemini provider; it SHALL live under a new backend
   feature module (e.g. `backend/src/agent/` and/or `backend/src/chat/`).
2. THE SYSTEM SHALL read the Google API key and any model/config from the
   environment by key name (documented in `backend/.env.example`), never
   hard-coded and never committed.
3. THE implementation SHALL pass `pnpm --dir backend lint`,
   `pnpm --dir backend format:check`, `pnpm --dir backend build`, and
   `pnpm --dir backend test`.
4. THE SYSTEM SHALL include automated tests that do NOT depend on a live model:
   auth required (`401`), per-user isolation (a caller cannot reach another
   user's conversation → `404`), tool scoping (tools always receive the caller's
   `userId`), the capture→confirm flow persists only after confirmation, a
   declined draft persists nothing, and guardrails decline money-movement
   requests. The model/provider SHALL be mockable so tests are deterministic.

## Open questions / decisions for design
These are flagged for the Tech Lead / Solution Architect to resolve in
`design.md`; the requirements above are intentionally agnostic to them:
- **Where the category label lives.** The current data model (Req 5.4) has no
  category column (`data-model-and-persistence` deliberately dropped categories).
  Options for design: fold the label into `description`, add an additive
  `category` column via a new migration (a schema change that would need its own
  coordination), or keep categories conversational-only for now. Design decides;
  if a schema change is chosen it must be an additive migration consistent with
  the ORM-migration convention.
- **Conversation/message schema.** The exact `conversation` and `message` tables
  (names, columns, indexes, cascade) and whether message history is capped or
  summarized for context.
- **Pending-action mechanism.** How the unconfirmed draft is represented across
  turns — Mastra working memory/thread state vs a persisted pending record vs a
  client-echoed structured draft — and how confirmation is detected robustly.
- **Mastra memory/storage backend.** Whether Mastra uses its own memory store or
  persists through the existing Postgres/TypeORM, and the specific Gemini model
  id, per the steering note that these are chosen per-feature.
- **Endpoint shape.** Route base(s) (e.g. `POST /chat` vs
  `POST /conversations/:id/messages`), and whether replies are returned whole
  (streaming is out of scope for now).
- **System prompt & guardrails.** The exact system instructions encoding the
  non-goals (no money movement, no regulated advice, user-scope only) and the
  injection-resistance strategy.

## Status
- Requirements: drafted, ready for review.
- Design (`design.md`): not started — pending Tech Lead (architecture) informed
  by the Solution Architect.
- Tasks (`tasks.md`): not started — pending design.

Depends on: `data-model-and-persistence` (implemented — user-scoped
`TransactionsService` and the `transaction` table), `user-authentication`
(implemented — `JwtAuthGuard` and `@CurrentUser`), `transaction-http-api`
(specced — shares the same service and field/filter semantics),
`agentic-chat-layout` (implemented — the static chat UI this backend will later
power via a separate frontend-integration spec).
