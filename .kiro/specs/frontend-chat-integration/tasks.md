# Tasks — Frontend Chat Integration

Implementation plan. Frontend-only (`frontend/`), Next.js 16.4.3 + React 19,
TypeScript, Tailwind v4, pnpm under Node 24.22.1. Implements the Tech Lead's
architecture (Decisions 1–8) in `design.md` against the PM's `requirements.md`.
Wires the static chat (`agentic-chat-layout`) to the **implemented**
`conversational-agent-backend` endpoints, reusing the session + shared
`AuthApiClient` from `frontend-auth-integration`. **No backend changes.** Reuses
existing `--brand` tokens — **no new design tokens**.

Before writing code, read the relevant guide under `node_modules/next/dist/docs/`
per `frontend/AGENTS.md` (this Next.js has breaking changes). Prefer
`package.json` scripts: `pnpm --dir frontend lint`, `pnpm --dir frontend build`,
`pnpm --dir frontend format:check`.

- [x] 1. Define the chat types (mirror the backend contract)
  - Create `src/lib/chat/types.ts`: `MessageRole = 'user' | 'agent'`,
    `ChatMessageDto { id, conversationId, role, content, createdAt }`, and
    `Conversation { id, title: string | null, createdAt, updatedAt }` — matching
    the verified backend `message`/`conversation` shapes. Keep the existing
    presentational `ChatMessage { id, role, text }` in `components/chat/messages.ts`.
  - _Requirements: 2.1, 2.4 · Design: Decision 3_

- [x] 2. Expose the shared API client via the auth context
  - In `src/lib/auth/auth-provider.tsx`, add **`getApiClient(): AuthApiClient`**
    to `AuthContextValue`, returning the same lazily-created instance from the
    existing `getApi()` ref (stable `useCallback`). Additive only — do not change
    `login`/`register`/`logout`/`getToken` or the forms. `AuthApiClient` and
    `authedFetch` stay unchanged.
  - _Requirements: 4.1, 4.3 · Design: Decision 1 ("reuse, don't duplicate")_

- [x] 3. Implement the typed `ChatApi` over `authedFetch`
  - Create `src/lib/chat/chat-api.ts`: a `ChatApi` constructed from an
    `AuthApiClient`, with `startConversation(message, title?)`,
    `sendMessage(conversationId, message)`, and (defined, not UI-wired)
    `listConversations()` / `listMessages(conversationId)`. Map results to the
    typed `ChatResult<T>` / `ChatError`
    (`validation`→400, `not-found`→404, `unavailable`→502/503,
    `network`→transport, `unknown`). **Do not** map `401` — let `authedFetch`'s
    global `onUnauthorized` handle it; treat the `401` response as an aborted
    turn (no agent bubble). Build paths from hard-coded templates + the uuid id;
    body is `{ message, title? }` only (never a user/ownership hint). Parse JSON
    defensively. Never log token, bodies, or agent content.
  - _Requirements: 1.2, 1.3, 4.2, 4.4, 5.1, 5.2, 5.3, 5.4 · Design: Decisions 2, 3_

- [x] 4. Implement the `ChatProvider` + `useChat()`
  - Create `src/lib/chat/chat-provider.tsx` (`"use client"`): holds
    `conversationId`, `messages: ChatMessage[]`, `status: 'idle' | 'sending'`,
    `error: ChatError | null`, `lastAttemptedText`, and exposes
    `sendMessage(text)` + `dismissError()`. Build `ChatApi` once from
    `useAuth().getApiClient()` (memoized). `sendMessage` implements Decision 6:
    - trim; empty/whitespace → no-op (caller keeps focus); `length > 4000` →
      `error: 'validation'`, no request;
    - append optimistic user bubble (temp id), `status:'sending'`, clear input;
    - call `startConversation` when `conversationId === null` else `sendMessage`;
    - success → replace optimistic bubble with the server user turn + append the
      agent turn from `messages` (in order); on start, store `conversation.id`;
    - `unavailable`/`network` → remove optimistic bubble (no fabricated reply),
      set `error`, keep `lastAttemptedText`;
    - `validation` → same, validation copy; `404` → reset `conversationId=null`
      + gentle notice (next send starts fresh);
    - finally `status:'idle'`.
  - Adapter maps `ChatMessageDto.content → text`, `role` through.
  - _Requirements: 1.2, 1.3, 1.4, 1.5, 1.6, 2.1, 3.1, 3.2, 3.3, 5.1, 5.2, 5.3 · Design: Decisions 4, 5, 6_

- [x] 5. Make `MessageInput` functional
  - Convert `src/components/chat/message-input.tsx` to `"use client"`: wrap the
    row in a real `<form>` with `onSubmit`; controlled input bound to local
    state; send button `type="submit"`; Enter submits. On submit call
    `useChat().sendMessage(value)`; clear on success-path (provider clears via
    state). Empty/whitespace submit → keep focus, no send (Req 1.5). Enforce
    `maxLength={4000}` + guard (Req 1.6). Disable the input/button while
    `status==='sending'` and show a spinner/disabled send (Req 3.2). Preserve the
    existing label, `aria`, brand styling, and placeholder copy.
  - _Requirements: 1.1, 1.5, 1.6, 3.2 · Design: Decisions 7, 8_

- [x] 6. Render the live conversation in `MessageList`
  - Convert `src/components/chat/message-list.tsx` to `"use client"`: read
    `messages` + `status` from `useChat()`. When `messages.length === 0` render
    `WelcomeState` (empty state, Req 2.2); otherwise map live `messages` to
    `MessageBubble` (user vs agent), **removing `sampleMessages` from the live
    render**. While `status==='sending'` append the pending bubble (task 7).
    Auto-scroll to the newest turn via a ref'd sentinel + `scrollIntoView` on
    change, without breaking keyboard scroll; keep `role="log"`
    `aria-live="polite"`. Render `content` as plain text (`whitespace-pre-wrap`),
    no parsing/money math (Req 2.4).
  - Drop `sampleMessages` from the component import; keep the `ChatMessage` type.
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 6.3 · Design: Decisions 3, 8_

- [x] 7. Add the pending ("typing") bubble
  - Create `src/components/chat/pending-bubble.tsx`: an agent-aligned bubble
    reusing `MessageBubble`'s agent styling (`border-brand`/`bg-brand-tint`) with
    three animated dots and an accessible label ("Finlux is thinking…"). No new
    design tokens; existing Tailwind utilities only.
  - _Requirements: 3.1 · Design: Decision 7_

- [x] 8. Add the safe error notice + retry
  - Create `src/components/chat/error-notice.tsx` (`"use client"`): renders the
    mapped `ChatError` as generic, status-free copy (validation / unavailable /
    network / not-found variants per Design "Security & non-disclosure"), with a
    dismiss (`dismissError`) and, for `unavailable`/`network`, a **Retry**
    `<button>` that resends `lastAttemptedText`. Placed above the input inside the
    chat. No stack traces, status codes, or internals (Req 5.4).
  - _Requirements: 5.1, 5.2, 5.3, 5.4 · Design: Decisions 6, 8_

- [x] 9. Wire `ChatProvider` into `ChatShell`
  - In `src/components/chat/chat-shell.tsx`, wrap the composed chat
    (`ChatHeader` + `MessageList` + `ErrorNotice` + `MessageInput`) in
    `<ChatProvider>`, keeping the `headerAction` slot (LogoutButton) unchanged.
    `AuthGate` and `AuthProvider` externals stay untouched (provider scope is
    exactly the chat).
  - _Requirements: 1.2, 2.1 · Design: Decision 8_

- [x] 10. Verify token/`401`/non-disclosure wiring end to end (read-through)
  - Confirm: every chat call goes through `getApiClient().authedFetch` (Bearer +
    global `401`), so a mid-session `401` clears the session and `AuthGate` shows
    the auth screen with **no** chat error (Req 4.3); no client-asserted
    user/ownership is sent (Req 4.2); grep that token, message bodies, and agent
    content are never passed to `console.*` (Req 4.4); error copy exposes no
    internals (Req 5.4). Confirm `NEXT_PUBLIC_API_BASE_URL` is the only config and
    no new env key was added (Req 7.1).
  - _Requirements: 4.2, 4.3, 4.4, 5.4, 7.1 · Design: "Security & non-disclosure"_

- [x] 11. Add the test runner and the send-flow tests (Req 7.4)
  - Add dev-only tooling: **Vitest + @testing-library/react + jsdom** (pinned,
    mirroring the backend's Vitest choice), a `vitest.config.ts`, and a `test`
    script in `frontend/package.json`. Do not change runtime deps.
  - Tests (mock `authedFetch` with scripted `Response`s; no live model): first
    send → `POST /conversations` and adopts the returned id; second send →
    `POST /conversations/:id/messages`; empty/whitespace → no request; `>4000` →
    client validation, no request; in-flight disables duplicate submit; a `401`
    `Response` triggers the client's `onUnauthorized` (session cleared); `502`/
    `503`/network → retryable error and `lastAttemptedText` preserved; `404` →
    `conversationId` reset so the next send starts fresh.
  - If introducing the runner is declined by the PM (see design's note on
    Req 7.4), skip the runner but still land tasks 1–10 with the testable seams
    intact; `lint` + `build` remain the hard gate.
  - _Requirements: 7.4 · Design: "Testing strategy"_

- [x] 12. Verify build, lint, format (and tests)
  - Run `pnpm --dir frontend lint`, `pnpm --dir frontend format:check`,
    `pnpm --dir frontend build` — all must pass (Req 7.3, the hard gate). If
    task 11's runner was added, run `pnpm --dir frontend test`. Manually confirm
    the data-flow: first message starts a conversation and renders user + agent
    turns; subsequent messages continue it; welcome state shows only when empty;
    pending indicator appears while sending and duplicate submits are blocked;
    a simulated `401` returns to the auth screen; `502`/`503`/network shows a
    retryable notice and preserves the text; brand/green styling matches the chat
    with no new tokens.
  - _Requirements: 7.3, 7.4 · Design: "Verification"_

## Notes
- **Status: implemented and verified (all 12 tasks done).** The Frontend Engineer
  delivered the feature; the Tech Lead independently re-ran the gate —
  `pnpm --dir frontend lint` ✓, `pnpm --dir frontend build` ✓ (TypeScript
  included), `pnpm --dir frontend test` ✓ (21 tests across
  `chat-api.test.ts` + `chat-send-flow.test.tsx`). Checkboxes marked by the Tech
  Lead because the engineer's role is read-only on `.kiro/specs/**`.
- Implementation notes from delivery: the test runner (Vitest + RTL + jsdom) was
  added as dev-only tooling (anticipated by the design's Req-7.4 note); the
  Vitest config uses `vitest.config.mts` to avoid an ESM-in-CJS warning. The
  `ChatApi` adds an explicit `aborted-unauthorized` error kind for the globally
  handled `401` — consistent with Decision 2 (the `401` is not surfaced as a
  normal turn error). `auth-provider.tsx` change confirmed additive (only
  `getApiClient()` added; flows/forms untouched).
- Not committed yet — the Tech Lead/user handles commit + push.
- Scope guard: **no backend/agent/guardrail change**; no streaming; no history
  sidebar or cross-conversation switching; no reload rehydration; no rich
  transaction rendering; no client money math/FX; no real-money movement.
- The only `lib/auth/*` change is the additive `getApiClient()` on the context
  (task 2); the auth forms and `AuthApiClient` behavior are untouched.
- `GET /conversations` and `GET /conversations/:id/messages` are implemented in
  `ChatApi` (task 3) but intentionally **not wired** into the UI (reserved for a
  later history spec) — one fresh conversation per session.
- Req 7.4 implies adding a test runner the frontend lacks today; task 11 makes
  that an explicit, scoped step. The non-negotiable gate is `lint` + `build`
  (Req 7.3). Flagged for the PM in `design.md`; requirements are PM-owned and not
  edited here.
- Render the agent's `content` verbatim as plain text — never parse or recompute
  money (the agent keeps `amount` a decimal string and currency explicit).

Depends on: `conversational-agent-backend` (implemented — the chat endpoints),
`frontend-auth-integration` (implemented — session, `AuthApiClient`,
`authedFetch`, global `401`), `agentic-chat-layout` (implemented — chat
shell/bubbles/input/tokens), `user-authentication` (implemented — the bearer JWT).
