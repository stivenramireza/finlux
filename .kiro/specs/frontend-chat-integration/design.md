# Design — Frontend Chat Integration

## Goal
Make the static Finlux chat (`agentic-chat-layout`) a live conversation with the
implemented conversational agent backend. The authenticated user types a
message; the frontend sends it over the shared authenticated API client; the
agent's grounded reply is rendered; the conversation is tracked for the session
so it can be continued. Frontend + wiring only — no backend, agent, tool, or
guardrail change.

This document is authored by the Tech Lead. It resolves the open questions in
`requirements.md` and is authoritative for implementation. The Frontend Engineer
implements against these decisions; no backend work is in scope.

## Tech context (verified against the codebase)
- Next.js **16.4.3**, React **19.3.0**, TypeScript, Tailwind v4, pnpm/Node
  24.22.1. `frontend/AGENTS.md` warns this Next.js has breaking changes — the
  Frontend Engineer **must** read the relevant guide under
  `node_modules/next/dist/docs/` before writing code. This design stays at the
  architecture level and does not prescribe version-specific Next APIs.
- The home route is already gated (`frontend-auth-integration`):
  `app/page.tsx` → `AuthGate` (`"use client"`) switches on `useAuth().status`:
  `undetermined → LoadingCard`, `unauthenticated → AuthScreen`,
  `authenticated → <ChatShell headerAction={<LogoutButton/>} />`. **This spec
  only touches the `authenticated` branch** (the chat).
- Chat components (verified, all presentational/server by default):
  - `ChatShell` — composes `ChatHeader`, `MessageList`, `MessageInput`; accepts a
    `headerAction` slot.
  - `MessageList` — scrollable `role="log"` region; currently renders
    `WelcomeState` + hard-coded `sampleMessages`.
  - `MessageInput` — green-bordered row, `role="group"`, a labeled `<input>` and
    a `type="button"` send button. **No submission behavior today.**
  - `MessageBubble` — `role: 'user' | 'agent'`, user right / agent left (brand
    border). Reused as-is.
  - `messages.ts` — `ChatRole = 'user' | 'agent'`, `ChatMessage { id, role, text }`,
    and the static `sampleMessages` (to be removed from the live render).
- Auth building blocks (verified):
  - `AuthProvider` (`lib/auth/auth-provider.tsx`, `"use client"`) owns the
    in-memory token (source of truth, mirrored to `sessionStorage`), exposes
    `useAuth(): { status, user, login, register, logout, getToken }`, and
    **privately** constructs an `AuthApiClient` via a `getApi()` ref wired with
    `getToken` and `onUnauthorized → clearSession()`.
  - `AuthApiClient` (`lib/auth/api-client.ts`) has
    `authedFetch(path, init): Promise<Response>` that attaches
    `Authorization: Bearer <token>`, sets `Content-Type: application/json`, and
    on a `401` invokes `onUnauthorized()` (the global return-to-auth path). It is
    the single owner of the token header and the global `401` transition.
  - `getApiBaseUrl()` (`lib/auth/config.ts`) reads `NEXT_PUBLIC_API_BASE_URL`
    (no hard-coded fallback; throws if missing).
- **No frontend test runner exists** (`frontend/package.json` has only `dev`,
  `build`, `start`, `lint`, `lint:fix`, `format`, `format:check`). See
  "Testing strategy" for how Req 7.4 is satisfied without over-reaching.

## The central constraint (and the decision it forces)
`AuthApiClient` already implements exactly the two things Req 4 mandates — the
`Authorization: Bearer` header and the global `401 → onUnauthorized` transition —
but it is **encapsulated inside `AuthProvider`** and not reachable from outside.
The chat must reuse *that* client (not a second fetch wrapper), otherwise the
global `401` handling and token accessor would be duplicated and could drift.

Therefore the key architectural move is: **expose the existing `AuthApiClient`
through the auth context**, and build the chat layer as a thin typed wrapper over
its `authedFetch`. This reuses the token + `401` path verbatim (Req 4.1, 4.3)
without widening what the forms depend on.

## Resolved decisions (close the requirements' open questions)

### Decision 1 — Expose the shared client via the auth context (reuse, don't duplicate)
Add the existing client to the auth context as a stable accessor:
- Extend `AuthContextValue` with **`getApiClient(): AuthApiClient`** (returns the
  same lazily-created instance the provider already builds in `getApi()`). No new
  client, no second token accessor, no second `onUnauthorized`.
- Rationale vs the alternatives in the open questions:
  - *Extend `AuthApiClient` with chat methods* — rejected: it would couple the
    auth client to chat concerns and bloat the auth module; the client should stay
    a transport (`authedFetch`) + auth-endpoint mapper.
  - *Sibling module with its own token accessor + `onUnauthorized`* — rejected:
    it duplicates the exact wiring Req 4 says to reuse and risks divergence.
  - *Expose the client via the provider* (chosen) — the chat consumes
    `getApiClient().authedFetch(...)`, inheriting the token header and global
    `401` with zero duplication.
- This is the one small change to `lib/auth/*`; it is additive (the forms are
  unchanged) and documented as the sanctioned reuse point for future
  authenticated features too.

### Decision 2 — A dedicated chat API module (typed, pure, mockable)
Add `lib/chat/chat-api.ts`: a small class/factory `ChatApi` constructed from an
`AuthApiClient`, exposing typed methods that map HTTP results to a typed outcome
(mirroring the auth client's `ApiResult<T>` discipline so UI code never inspects
raw status codes):
```ts
type ChatError =
  | { kind: 'validation' }          // 400
  | { kind: 'not-found' }           // 404 (active conversation gone/not owned)
  | { kind: 'unavailable' }         // 502 / 503 (model/provider/downstream)
  | { kind: 'network' }             // transport failure
  | { kind: 'unknown'; status?: number };
type ChatResult<T> = { ok: true; data: T } | { ok: false; error: ChatError };

startConversation(message: string, title?: string):
  Promise<ChatResult<{ conversation: Conversation; messages: ChatMessageDto[] }>>;
sendMessage(conversationId: string, message: string):
  Promise<ChatResult<{ messages: ChatMessageDto[] }>>;
// Optional, only if Decision 5 "resume" is enabled:
listConversations(): Promise<ChatResult<Conversation[]>>;
listMessages(conversationId: string): Promise<ChatResult<ChatMessageDto[]>>;
```
- A `401` is **not** mapped here: it is already handled globally inside
  `authedFetch` (`onUnauthorized` clears the session, the gate re-renders the
  auth screen). The chat layer just lets that `Response` fall through and treats
  it as an aborted turn (no agent bubble added) — Req 4.3.
- Paths are built from hard-coded templates + the uuid `conversationId`; the body
  is `{ message, title? }`. No user/ownership hint is ever sent (Req 4.2).
- `ChatApi` is a pure wrapper over an injected client → trivially unit-testable
  with a fake `authedFetch` (Req 7.4).

### Decision 3 — Types mirror the backend contract exactly
Add `lib/chat/types.ts`:
```ts
type MessageRole = 'user' | 'agent';
interface ChatMessageDto {        // matches backend `message`
  id: string; conversationId: string; role: MessageRole;
  content: string; createdAt: string;
}
interface Conversation {          // matches backend `conversation`
  id: string; title: string | null; createdAt: string; updatedAt: string;
}
```
- The existing presentational `ChatMessage { id, role, text }` (chat UI type) is
  kept for rendering; a tiny adapter maps `ChatMessageDto.content → text` and
  `role` straight through. We render `content` verbatim as plain text — no
  parsing, no money math (Req 2.4, 6.3). (The agent's reply may contain newlines;
  render with normal text wrapping / `whitespace-pre-wrap`, not a markdown or
  number parser.)

### Decision 4 — Chat state in a dedicated `ChatProvider` (client boundary)
Chat state lives in a new **`ChatProvider`** (`lib/chat/chat-provider.tsx`,
`"use client"`) that wraps the chat subtree, rather than being stuffed into
`AuthProvider` (keeps auth and chat concerns separate) or scattered in
components. It holds, for the session:
```ts
interface ChatState {
  conversationId: string | null;      // active conversation (null until first send)
  messages: ChatMessage[];            // ordered turns to render
  status: 'idle' | 'sending';         // in-flight flag (Req 3)
  error: ChatError | null;            // last turn error, for the banner (Req 5)
  lastAttemptedText: string | null;   // recoverable text on failure (Req 5.1)
  sendMessage(text: string): Promise<void>;
  dismissError(): void;
}
```
- `useChat()` exposes this to the chat components. The provider gets `ChatApi`
  from `useAuth().getApiClient()` (Decision 1) once and memoizes it.
- Why a provider (not local `useState` in a container): `MessageInput` (submit),
  `MessageList` (render + pending), and a potential error banner all read/write
  the same turn state; a small context avoids prop-drilling and keeps a single
  source of truth for "is a turn in flight".

### Decision 5 — One fresh conversation per session (no resume in this spec)
Keep **one active conversation per session**; do **not** auto-load history on
mount. Rationale: Req scope lists history browsing / rehydration as out of scope,
and `frontend-auth-integration` stores the token in `sessionStorage` (cleared on
tab close), so a "session" is already the natural unit. The `GET /conversations`
and `GET /conversations/:id/messages` methods are **defined** in `ChatApi`
(Decision 2) for the later history spec but are **not wired** into the UI here.
- First send with `conversationId === null` → `startConversation` → adopt the
  returned `conversation.id` (Req 1.2). Subsequent sends → `sendMessage` on that
  id (Req 1.3).
- `404` on a continue (active conversation gone/not owned) → clear
  `conversationId` to `null` and surface a gentle notice; the **next** send
  starts a fresh conversation (Req 5.3). We do not disclose existence.

### Decision 6 — Optimistic user bubble, reconciled from the server response
On submit:
1. Trim the text; if empty/whitespace → do nothing, keep focus (Req 1.5). If
   `length > 4000` → set `error: { kind: 'validation' }` with client copy and do
   **not** send (Req 1.6).
2. Append an **optimistic** user bubble (temporary client id) and set
   `status: 'sending'`; clear the input immediately (Req 1.1, 3.1). Disable the
   send control while `sending` (Req 3.2).
3. Call the appropriate `ChatApi` method.
   - **Success**: replace the optimistic user bubble with the **server's**
     returned user turn and append the agent turn, both from `messages` in order
     (so ids/timestamps are authoritative) — Req 1.4, 2.1. On a
     `startConversation` success, also store `conversation.id`.
   - **Failure** (`unavailable`/`network`): remove the optimistic bubble (or mark
     it failed) so **no fabricated agent reply** appears, set `error`, and set
     `lastAttemptedText` so the user can retry without retyping (Req 5.1). Restore
     the text into the input for easy resend.
   - **`validation` (400)**: same as failure but with the validation copy; no
     agent turn (Req 5.2).
   - **`404`**: Decision 5 handling.
4. Finally set `status: 'idle'` and re-enable input (Req 3.3).

Optimistic (not purely confirmed) rendering is chosen so the user's message shows
instantly while the agent "thinks" (Req 3.1); the server response is the
reconciliation point so persisted ids/order win.

### Decision 7 — Pending indicator: a dedicated agent-side "typing" bubble
While `status === 'sending'`, render a lightweight **agent-aligned pending
bubble** (three animated dots) below the optimistic user message, reusing
`MessageBubble`'s agent styling (brand border/tint) so it reads as "the agent is
responding". The send button shows a disabled/spinner state. No new design
tokens — only existing `--brand`/`--brand-tint` and Tailwind utilities (Req 6.1).
`aria-live="polite"` on the log announces the new turns; the pending bubble
carries an accessible label like "Finlux is thinking…".

### Decision 8 — Components that become Client Components, and what changes
Minimal, surgical changes; keep presentational pieces server-friendly where
possible:
- **`ChatProvider`** — new, `"use client"` (holds state, calls the API).
- **`MessageInput`** — becomes `"use client"`: wrap the row in a real `<form>`
  with `onSubmit` (Enter submits; the send button is `type="submit"`), controlled
  value, disabled while sending, `maxLength`/length guard, keeps focus on empty
  submit (Req 1.1, 1.5, 1.6, 3.2). Preserves the existing label, aria, and brand
  styling.
- **`MessageList`** — becomes `"use client"`: render `WelcomeState` when
  `messages.length === 0` (Req 2.2), otherwise map live `messages` to
  `MessageBubble` (removing `sampleMessages` from the live path), append the
  pending bubble while sending, and **auto-scroll to the newest turn** on change
  via a ref'd sentinel + `scrollIntoView`, without stealing keyboard scroll
  (Req 2.3). `sampleMessages` is deleted from the render (it may remain only in a
  test/storybook fixture, otherwise removed).
- **New `ErrorNotice`** — a small `"use client"` inline banner inside the chat
  (above the input) that renders the mapped `ChatError` as safe generic copy with
  a dismiss and (for `unavailable`/`network`) a **Retry** affordance that resends
  `lastAttemptedText` (Req 5). Uses existing tokens.
- **`ChatShell`** — stays a thin composition but is now wrapped by `ChatProvider`
  (either `ChatShell` renders `<ChatProvider>…</ChatProvider>` internally, or the
  gate mounts `<ChatProvider><ChatShell/></ChatProvider>`). Chosen: wrap **inside
  `ChatShell`** so `AuthGate` is untouched and the provider scope is exactly the
  chat. `headerAction` (LogoutButton) is unchanged.
- **`ChatHeader`, `MessageBubble`, `WelcomeState`, `LogoutButton`, `AuthGate`,
  `AuthProvider` internals** — unchanged except the additive `getApiClient()` on
  the context (Decision 1).

## Data flow (one turn)
```
MessageInput.onSubmit(text)
  → useChat().sendMessage(text)
      → validate (empty / >4000)                      [client-side guards]
      → optimistic user bubble + status:'sending'
      → ChatApi.startConversation|sendMessage(...)      [via authedFetch: Bearer + global 401]
          → 201 → reconcile bubbles from server `messages`, store conversationId
          → 400 → error:'validation'
          → 404 → conversationId=null, gentle notice (next send starts fresh)
          → 502/503 → error:'unavailable' (+ retry), keep text
          → network → error:'network' (+ retry), keep text
          → 401 → authedFetch.onUnauthorized() clears session → AuthGate shows AuthScreen
      → status:'idle', re-enable input
```

## Module / file structure
```
frontend/src/
├── lib/
│   ├── auth/
│   │   ├── auth-provider.tsx     # MODIFIED — add getApiClient() to context value
│   │   └── api-client.ts         # UNCHANGED (authedFetch reused)
│   └── chat/                     # NEW
│       ├── types.ts              # ChatMessageDto, Conversation, MessageRole
│       ├── chat-api.ts           # ChatApi over AuthApiClient.authedFetch (typed results)
│       └── chat-provider.tsx     # ChatProvider + useChat() ("use client")
└── components/chat/
    ├── chat-shell.tsx            # MODIFIED — wrap children in ChatProvider
    ├── message-input.tsx         # MODIFIED — "use client", form submit + guards
    ├── message-list.tsx          # MODIFIED — "use client", live messages + pending + autoscroll
    ├── message-bubble.tsx        # UNCHANGED
    ├── welcome-state.tsx         # UNCHANGED (empty state)
    ├── chat-header.tsx           # UNCHANGED
    ├── messages.ts               # MODIFIED — keep ChatMessage type; drop sampleMessages from render
    ├── pending-bubble.tsx        # NEW — agent "typing…" indicator (reuses bubble styling)
    └── error-notice.tsx          # NEW — safe error banner + retry
```

## Security & non-disclosure
- The access token is attached only by the existing `authedFetch`; the chat layer
  never reads, stores, or logs it (Req 4.4). No `console.*` of token, message
  bodies, or agent content anywhere in the new code.
- No client-asserted identity/ownership is sent — only `{ message, title? }` and
  the uuid in the path (Req 4.2).
- Error copy is generic and status-free: validation → "That message couldn't be
  sent — please shorten or adjust it."; unavailable/network → "Finlux is
  unavailable right now. Your message was kept — try again."; `404` →
  "That conversation isn't available anymore — starting a new one." No stack
  traces, status codes, SQL, provider internals, or tokens (Req 5.4).
- Copy stays on-brand and within non-goals; the frontend never promises
  money-movement/bank-connection/advice — it only relays the agent's text
  (Req 6.2, 6.3).

## Accessibility
- `MessageList` keeps `role="log"` `aria-live="polite"` so new turns are
  announced; the pending bubble has an accessible "thinking" label; auto-scroll
  does not remove keyboard scrollability (Req 2.3).
- `MessageInput` stays a labeled control; becomes a real `<form>` so Enter
  submits and the send button has an accessible name; disabled state is conveyed
  while sending (Req 1.1, 3.2).
- `ErrorNotice` is reachable and its Retry is a real `<button>` with an
  accessible name; the notice is associated with the input region.

## Testing strategy (Req 7.4) — honest about current tooling
There is **no test runner in `frontend/` today**, and the hard quality gate the
requirements mandate is `pnpm --dir frontend lint` + `build` (Req 7.3). The
design makes the logic unit-testable and specifies the runner as a **scoped,
optional addition** rather than pretending one exists:
- **Design-for-test (mandatory):** `ChatApi` is a pure wrapper over an injected
  client, and all turn logic lives in `ChatProvider`/`ChatApi` (not in JSX), so
  they can be exercised with a fake `authedFetch` returning scripted `Response`s
  — no live model, deterministic (Req 7.4 "mockable").
- **Runner (recommended, see tasks):** add **Vitest + React Testing Library +
  jsdom** as dev-only tooling with a `test` script, mirroring the backend's
  Vitest choice for consistency. Tests to cover: first send → `POST
  /conversations` and adopts the id; second send → `POST /conversations/:id/
  messages`; empty/whitespace → no request; `>4000` → client validation, no
  request; in-flight disables duplicate submit; a `401` `Response` triggers the
  client's `onUnauthorized` (session cleared); `502`/`503`/network → retryable
  error and `lastAttemptedText` preserved; `404` → `conversationId` reset.
- If adding the runner is deferred, the **mandatory** gate remains `lint` +
  `build`, and the testable seams above are still delivered so tests can be added
  without refactor. The Tech Lead flags that shipping Req 7.4 fully implies
  introducing the runner; this is the one piece of tooling this spec adds.

## Verification
- `pnpm --dir frontend lint` and `pnpm --dir frontend build` pass (Req 7.3) —
  the non-negotiable gate.
- Manual/automated check of the data-flow table: first message starts a
  conversation and renders user + agent turns; subsequent messages continue it;
  the welcome state shows only when empty; the pending indicator appears while
  sending and duplicate submits are blocked; a simulated `401` returns to the
  auth screen; `502`/`503`/network shows a retryable notice and preserves the
  text; brand/green styling matches the chat with no new tokens.
- `NEXT_PUBLIC_API_BASE_URL` is the only config; no new required env key.

## Open questions resolved (summary for the PM)
All six open questions from `requirements.md` are closed above:
1. State location → dedicated `ChatProvider` (Decision 4).
2. Client reuse → expose the existing `AuthApiClient` via the auth context;
   thin `ChatApi` over `authedFetch` (Decisions 1–2).
3. Optimistic vs confirmed → optimistic user bubble reconciled from the server
   response; no fabricated agent reply on failure (Decision 6).
4. Resume/history → one fresh conversation per session; `GET` methods defined
   but not wired (Decision 5).
5. Pending indicator → agent-side "typing" bubble + disabled/spinner send
   (Decision 7), existing tokens only.
6. `"use client"` components → `ChatProvider`, `MessageInput`, `MessageList`,
   `ErrorNotice`, `PendingBubble` (Decision 8); `ChatShell` wraps the provider.

## Note to the Product Manager (no requirements edited)
- Requirements are PM-owned and left unchanged. One reconciliation to flag:
  **Req 7.4 implies adding a test runner** the frontend does not yet have. The
  design treats the runner as an explicit, scoped addition and keeps `lint` +
  `build` (Req 7.3) as the hard gate; if you'd prefer to keep testing out of this
  spec entirely, reword 7.4 (currently "where practical") and the design's
  testing section collapses to the design-for-test seams only. No functional
  requirement changes either way.

## Out of scope (restated)
No backend/agent/guardrail change; no streaming; no history sidebar or
cross-conversation switching; no reload rehydration; no rich transaction
rendering / categorization UI / dashboards; no client-side money math or FX; no
real-money movement.

## Status
- Requirements: drafted (PM).
- Design: **complete (Tech Lead).** Open questions resolved (Decisions 1–8).
- Tasks (`tasks.md`): pending (Tech Lead) — to be written against this design.

Depends on: `conversational-agent-backend` (implemented — the chat endpoints),
`frontend-auth-integration` (implemented — session, `AuthApiClient`,
`authedFetch`, global `401`), `agentic-chat-layout` (implemented — the chat
shell/bubbles/input/tokens this spec makes functional), `user-authentication`
(implemented — the bearer JWT the chat requests carry).
