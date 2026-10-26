# Requirements — Frontend Chat Integration

## Overview
Wire the Next.js frontend chat (`frontend/`) to the implemented conversational
agent backend (`conversational-agent-backend`) so that an authenticated user can
hold a real natural-language conversation with the Finlux agent from the
browser. This turns the static chat layout (`agentic-chat-layout`) into a live,
functional chat: the user types a message, it is sent to the agent over the
authenticated HTTP API, the agent's grounded reply is displayed, and the
conversation persists so it can be continued.

This is a **frontend + wiring spec**. It consumes the already-implemented backend
chat endpoints and the already-implemented frontend auth session; it does
**not** add or change any backend behavior, nor the agent's reasoning, tools, or
guardrails.

## Terminology
- **User / caller**: the authenticated login identity, per `user-authentication`
  and `frontend-auth-integration`. The frontend holds a valid, non-expired
  bearer JWT for this user.
- **Agent**: the backend Mastra/Gemini agent exposed over HTTP by
  `conversational-agent-backend`. The frontend never talks to the model
  directly; it only calls the backend chat endpoints.
- **Conversation**: an ordered exchange of user and agent messages owned by one
  user (backend `conversation` resource). Identified by a `conversationId`
  (uuid).
- **Message**: a single turn authored by the `user` or the `agent`, with text
  and a timestamp (backend `message` resource).
- **Turn**: one round trip — the user sends a message and the agent replies.
- **Chat screen**: the existing `ChatShell` from `agentic-chat-layout`, shown in
  the authenticated state per `frontend-auth-integration`.

## Backend contract (consumed, not defined here)
These are the shapes the frontend integrates against, as **implemented** in
`conversational-agent-backend` (verified in `backend/src/chat/`: `ChatController`,
`ChatService`, `message.entity.ts`, `send-message.dto.ts`; also
`#[[file:../conversational-agent-backend/design.md]]`, Decision 1). This spec does
not change them. All routes are protected by `JwtAuthGuard`; the frontend MUST
send the user's bearer token on every call.

- `POST /conversations` — start a conversation with a first user message.
  Request body `{ message: string }` (optional `title`). On success responds
  `201` with `{ conversation, messages }`, where `messages` contains the
  persisted user turn and the agent reply turn, in order.
- `POST /conversations/:id/messages` — continue an existing conversation the
  caller owns. Request body `{ message: string }`. On success responds `201`
  with `{ messages }` containing the new user turn and the agent reply turn.
- `GET /conversations` — list the caller's conversations; responds `200` with
  `Conversation[]`.
- `GET /conversations/:id/messages` — fetch the turns of a conversation the
  caller owns; responds `200` with `Message[]` in turn order.
- Validation (`message` empty, oversized — max 4000 chars — or unknown fields,
  non-uuid `:id`) is rejected with `400`. A missing/invalid/expired token is
  `401`. A conversation id not owned by the caller (non-existent or another
  user's) is `404`, indistinguishable from a random id. A model/provider or
  downstream failure surfaces as `502`/`503` with a generic message, and the
  agent reply is **not** persisted on failure.
- A `message` carries at least `{ id, role: 'user' | 'agent', content, createdAt }`;
  a `conversation` carries at least `{ id, title, createdAt, updatedAt }`.
  Monetary figures in agent text are plain text (the agent keeps `amount` as a
  decimal string and currency explicit); the frontend renders the reply text
  as-is and does not parse or recompute money.

## Scope
In scope:
- Making the existing `MessageInput` functional: capturing the user's text,
  submitting it to the backend, and clearing/resetting the input on success.
- Rendering a **live conversation**: replacing the static sample bubbles with
  the real user and agent messages returned by the backend, in turn order, using
  the existing `MessageBubble` styling (user vs agent).
- Starting a new conversation on the first message of a session
  (`POST /conversations`) and continuing it on subsequent messages
  (`POST /conversations/:id/messages`), tracking the active `conversationId`.
- Sending the user's bearer token on every chat request via the existing shared
  authenticated client (`Authorization: Bearer <token>`), and honoring the
  global `401 → return to auth screen` behavior from `frontend-auth-integration`.
- In-flight UX: a visible pending/sending state, disabling duplicate submission
  while a turn is in flight, and showing the user's message optimistically or on
  confirmation while awaiting the agent reply.
- Error handling and safe, non-disclosing messaging for validation (`400`),
  not-found conversation (`404`), and model/backend failures (`502`/`503`,
  network), consistent with the backend's generic error behavior.
- Keeping the welcome state as the empty state and transitioning to the
  conversation view once messages exist.
- Accessibility of the live message log and the send interaction, preserving the
  existing semantics and brand styling.

Out of scope:
- Any backend change (endpoints, agent, tools, guardrails, persistence) — owned
  by `conversational-agent-backend`.
- Authentication, token issuance/storage, the auth screen, logout, or the gated
  home route — owned by `user-authentication` and `frontend-auth-integration`
  (this spec runs inside the already-authenticated chat screen and reuses its
  session and API client).
- **Streaming / token-by-token** rendering of the reply (the backend is
  non-streaming per its design); replies are shown whole when the turn completes.
- A conversation-history sidebar / switching between past conversations, and
  rehydrating a prior conversation on reload. This spec establishes one active
  conversation per session; browsing/resuming saved conversations
  (`GET /conversations`, `GET /conversations/:id/messages`) is a later
  enhancement unless design decides to include minimal resume.
- The natural-language capture **confirmation** UX beyond displaying the agent's
  prompts and relaying the user's typed confirmation as a normal message (the
  confirm/decline flow is driven by the agent via conversation text, per
  `conversational-agent-backend` Decision 6).
- Rich rendering of transactions (tables, charts), categorization UI, summaries
  dashboards, or proactive insights (later specs).
- Multi-currency conversion / FX, or any client-side money math.
- Moving real money or any action outside recording user-entered data (product
  non-goal).

## Requirements

### Requirement 1 — Sending a message
**User story:** As an authenticated user, I want to type a message and send it to
the Finlux agent, so that I can talk to it about my finances.

Acceptance criteria (EARS):
1. THE chat input SHALL let the user enter message text and submit it via the
   send button and via the keyboard (e.g. Enter), with an accessible label and
   send-button name (preserving the existing `agentic-chat-layout` semantics).
2. WHEN the user submits a non-empty message AND there is no active conversation,
   THE SYSTEM SHALL call `POST /conversations` with the message and the user's
   bearer token, and SHALL adopt the returned `conversationId` as the active
   conversation.
3. WHEN the user submits a non-empty message AND there is an active conversation,
   THE SYSTEM SHALL call `POST /conversations/:id/messages` for that conversation
   with the message and the user's bearer token.
4. WHEN a send succeeds, THE SYSTEM SHALL clear the input and render the new user
   turn and the agent reply turn in the message area, in order.
5. IF the message is empty or whitespace-only, THEN THE SYSTEM SHALL NOT send a
   request and SHALL keep the input focused for correction.
6. THE SYSTEM SHALL bound the message length consistently with the backend
   (reject or prevent submitting more than the backend's limit, 4000
   characters), surfacing a clear client-side message rather than relying only
   on a `400`.

### Requirement 2 — Displaying the live conversation
**User story:** As a user, I want to see my messages and the agent's replies in
order, so that I can follow the conversation.

Acceptance criteria (EARS):
1. WHEN the conversation has messages, THE SYSTEM SHALL render them as bubbles in
   turn order, visually distinguishing `user` from `agent` using the existing
   `MessageBubble` styling, and SHALL replace the static sample messages.
2. WHEN there are no messages yet, THE SYSTEM SHALL show the existing welcome
   state as the empty state (no static sample conversation).
3. WHEN a new turn is added, THE SYSTEM SHALL make the latest messages visible
   (e.g. scroll the log to the newest turn) without breaking keyboard
   scrollability.
4. THE SYSTEM SHALL render the agent's reply text as provided by the backend
   (plain text), without parsing, reformatting, or recomputing any monetary
   figures, so displayed numbers remain traceable to the agent's grounded answer.

### Requirement 3 — In-flight state and no duplicate turns
**User story:** As a user, I want clear feedback while the agent is thinking, so
that I know my message was received and I do not send it twice.

Acceptance criteria (EARS):
1. WHILE a turn is in flight, THE SYSTEM SHALL indicate progress (e.g. a pending
   indicator) and SHALL show the user's just-sent message in the log without
   waiting for the reply.
2. WHILE a turn is in flight, THE SYSTEM SHALL prevent submitting another message
   (disable the send control / ignore repeat submits) until the turn completes or
   fails.
3. WHEN the turn completes, THE SYSTEM SHALL remove the pending indicator and
   re-enable input.

### Requirement 4 — Authentication and session on chat requests
**User story:** As a user, I want my chat to use my authenticated session
securely, so that only my data is reached and an expired session is handled
gracefully.

Acceptance criteria (EARS):
1. THE SYSTEM SHALL attach the user's access token to every chat request using
   the `Authorization: Bearer <token>` scheme, via the existing shared
   authenticated API client (`frontend-auth-integration`).
2. THE SYSTEM SHALL NOT send a user identifier or conversation ownership hint
   from the client to assert identity; ownership is derived by the backend from
   the token.
3. WHERE a chat request returns `401` (token expired/invalid mid-session), THE
   SYSTEM SHALL route through the existing global unauthorized handling (discard
   the token and return to the auth screen) rather than showing a chat error.
4. THE SYSTEM SHALL NOT log the access token, message bodies, or the agent's
   content to the console or telemetry.

### Requirement 5 — Error handling (non-disclosing)
**User story:** As a user, I want clear, safe messages when something goes wrong,
so that I can retry without seeing confusing internals.

Acceptance criteria (EARS):
1. IF a send fails with a model/provider or downstream error (`502`/`503`) or a
   network/transport failure, THEN THE SYSTEM SHALL show a clear, generic,
   retryable message, SHALL keep the user's typed message recoverable (not
   silently lost), and SHALL NOT display a fabricated or partial agent reply.
2. IF a send is rejected with `400` (validation), THEN THE SYSTEM SHALL show a
   clear client-side error and keep the user on the chat without adding an agent
   turn.
3. IF a continue-conversation request returns `404` (the active conversation is
   no longer owned/found), THEN THE SYSTEM SHALL handle it gracefully — e.g. by
   starting a new conversation on the next send — without disclosing whether the
   id exists for another user.
4. THE SYSTEM SHALL NOT surface stack traces, status codes, SQL, provider
   internals, tokens, or other internal details in error copy.

### Requirement 6 — Scope, brand, and non-goals
**User story:** As any user, I want the chat to feel like Finlux and stay within
its promises, so that the experience is coherent and trustworthy.

Acceptance criteria (EARS):
1. THE chat SHALL reuse the existing Finlux brand presentation and green
   `--brand` design tokens from `agentic-chat-layout` (shell, bubbles, input),
   introducing no new design tokens.
2. THE frontend copy (placeholders, pending/error messages, empty state) SHALL
   stay consistent with `.kiro/steering/product.md` (clarity, agency, trust) and
   SHALL NOT promise out-of-scope capabilities (moving money, connecting banks,
   or regulated financial advice); such behavior is declined by the agent, and
   the frontend SHALL simply display the agent's response.
3. THE SYSTEM SHALL rely on the backend agent for all reasoning, capture
   confirmation, categorization, and guardrails; the frontend SHALL NOT
   re-implement or second-guess them, only relay messages and render replies.

### Requirement 7 — Configuration and quality
**User story:** As a developer, I want the integration to fit the project's stack
and pass its checks.

Acceptance criteria (EARS):
1. THE SYSTEM SHALL reach the backend using the already-configured
   `NEXT_PUBLIC_API_BASE_URL` (per `frontend-auth-integration`), with no
   hard-coded backend URL and no new required env key unless design justifies
   one (documented in `frontend/.env.example`).
2. THE implementation SHALL align with `frontend/AGENTS.md` and
   `.kiro/steering/tech.md` (Next.js App Router, React, TypeScript, Tailwind v4,
   pnpm under Node 24.22.1), live under `frontend/src/`, and reuse the existing
   `components/chat/*` and `lib/auth/*` building blocks rather than duplicating
   them.
3. THE implementation SHALL pass `pnpm --dir frontend lint` and
   `pnpm --dir frontend build`.
4. THE implementation SHALL include appropriate automated tests where practical
   (e.g. the send flow: first message starts a conversation and subsequent
   messages continue it; in-flight disables duplicate submits; `401` triggers the
   global unauthorized handling; `502`/`503`/network shows a retryable error and
   preserves the user's text), with the backend/API client mockable so tests are
   deterministic and do not require a live model.

## Open questions / decisions for design
These are flagged for the Tech Lead / Solution Architect to resolve in
`design.md`; the requirements above are intentionally agnostic to them:
- **Where chat state lives.** A dedicated chat context/provider vs local
  component state in a client-boundary chat container, and how the active
  `conversationId` and message list are held for the session.
- **Shared client reuse.** Whether to extend the existing `AuthApiClient`
  (`authedFetch`) with typed chat methods, add a small sibling chat API module
  that reuses the same token accessor and `onUnauthorized` wiring, or expose the
  client via the `AuthProvider`. The requirement only mandates that the token and
  global `401` handling are the existing ones.
- **Optimistic vs confirmed rendering.** Whether the user's message is rendered
  optimistically before the response or only from the backend's returned
  `messages`, and how a failed turn reconciles the optimistic bubble.
- **Resume on reload / history.** Whether to include a minimal
  "load the latest conversation on mount" using `GET /conversations` +
  `GET /conversations/:id/messages`, or keep one fresh conversation per session
  (history browsing is otherwise out of scope here).
- **Pending indicator shape.** The exact in-flight affordance (typing indicator
  bubble, disabled input with spinner) within the existing brand styling.
- **Client-side state components.** Which pieces must become Client Components
  (`"use client"`) to hold state and handle submission, given the current chat
  components are presentational/server by default.

## Status
- Requirements: drafted, ready for review.
- Design (`design.md`): not started — pending Tech Lead (architecture) informed
  by the Solution Architect.
- Tasks (`tasks.md`): not started — pending design.

Depends on: `conversational-agent-backend` (**implemented** — verified in
`backend/src/chat/`: `ChatController` exposes `POST /conversations`,
`POST /conversations/:id/messages`, `GET /conversations`,
`GET /conversations/:id/messages`, returning `{ conversation, messages }` /
`{ messages }`; `message` carries `{ id, conversationId, role, content,
createdAt }`; `SendMessageDto` bounds `message` to 4000 chars — this is the
contract the frontend calls), `frontend-auth-integration`
(implemented — provides the authenticated session, shared API client, and global
`401` handling), `agentic-chat-layout` (implemented — provides the chat shell,
bubbles, input, and brand tokens this spec makes functional),
`user-authentication` (implemented — the bearer JWT the chat requests carry).
