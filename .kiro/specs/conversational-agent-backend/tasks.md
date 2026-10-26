# Tasks — Conversational Agent Backend

Implementation plan. Backend-only (`backend/`), NestJS 12 + TypeORM, ESM (`.js`
import specifiers). Adds the chat/agent HTTP layer on top of the implemented
`JwtAuthGuard` + `@CurrentUser('userId')` (`user-authentication`) and the
implemented transaction HTTP API (`transaction-http-api`).

**Architecture (user decision 1a/2a):** transaction tools are exposed by an
**in-process Mastra MCP server** and reach transactions **only** by calling the
HTTP API `GET/POST/PUT/DELETE /transactions` as a client, forwarding the
**caller's JWT** as `Authorization: Bearer`. The agent has **no direct DB
access** to transactions and does **not** inject `TransactionsService`. The only
persistence this spec owns is its own `conversation`/`message` tables (additive
migration, `create-orm-migration` convention). The Gemini model and the
transaction API client are **mocked** in unit tests.

Prefer `package.json` scripts: `pnpm --dir backend lint`,
`pnpm --dir backend format:check`, `pnpm --dir backend build`,
`pnpm --dir backend test`, `pnpm --dir backend test:e2e`,
`pnpm --dir backend migration:run` / `migration:revert`.

- [x] 1. Add and pin agent/MCP dependencies + config keys
  - Add `@mastra/core` (v1+), `@mastra/mcp`, `@ai-sdk/google`, and `zod` to
    `backend/package.json` with exact pinned versions (pin a compatible set;
    note it if a major mismatch forces a choice).
  - Document in `backend/.env.example`: `AGENT_MODEL_ID` (default e.g.
    `gemini-2.5-flash`), `AGENT_CONTEXT_MAX_MESSAGES` (default 20), and
    `TRANSACTION_API_BASE_URL` (default `http://localhost:8000`).
    `GOOGLE_GENERATIVE_AI_API_KEY` is already documented. Read all via
    `ConfigService` by key name.
  - _Requirements: 9.1, 9.2 · Design: "New dependencies", Decision 10_

- [x] 2. Create the `conversation` and `message` entities
  - `chat/conversation.entity.ts` (table `conversation`): `id` uuid PK,
    `userId` (`user_id`) uuid NOT NULL FK → `user` (CASCADE), nullable `title`,
    `createdAt`/`updatedAt`.
  - `chat/message.entity.ts` (table `message`): `id`, `conversationId`
    (`conversation_id`) FK → `conversation` (CASCADE), `role` enum
    (`user`|`agent`, `enumName: 'message_role'`), `content` `text` NOT NULL,
    `createdAt` only (immutable). Index `(conversation_id, created_at)`.
  - Match the style of `transaction.entity.ts` (snake_case, `Relation<...>`,
    `.js` imports). These are the agent's **own memory** only — unrelated to the
    transaction MCP boundary.
  - _Requirements: 2.1, 2.5 · Design: Decision 2_

- [x] 3. Author and register the additive migration
  - Activate the **`create-orm-migration`** skill first and follow it.
  - `database/migrations/<ts>-CreateConversationAndMessageTables.ts` (timestamp
    after `1730000002000`): create the `message_role` enum, the `conversation`
    table (FK `fk_conversation_user` CASCADE, index `idx_conversation_user_id`),
    the `message` table (FK `fk_message_conversation` CASCADE, index
    `idx_message_conversation_id_created_at`); `down` drops indexes, tables, then
    the enum. Mirror `1730000002000-CreateSessionTable.ts` in style.
  - Register the entities + migration in **both** `database/data-source.ts` and
    `database/database.module.ts` (entities and migrations arrays, `.js` imports).
  - _Requirements: 2.1 · Design: Decision 2, "Tech context"_

- [x] 4. Implement the user-scoped `ConversationService`
  - `chat/conversation.service.ts`: `createConversation(userId, title?)`,
    `findAll(userId)`, `findOneOrFail(userId, id)` (throws `NotFoundException`
    scoped by `userId`), `addMessage(conversationId, role, content)`,
    `listMessages(userId, conversationId)` (ownership-checked), and a helper to
    load the **last N** messages (`AGENT_CONTEXT_MAX_MESSAGES`). Not-owned ≡
    non-existent (`404`).
  - _Requirements: 2.2, 2.3, 2.4, 2.6 · Design: Decision 2, 5_

- [x] 5. Implement the HTTP `TransactionApiClient` (Layer 3)
  - `mcp/transaction-api.client.ts`: a thin client over `fetch` for
    `TRANSACTION_API_BASE_URL`, with methods `list({type?,dateFrom?,dateTo?},
    token)`, `getOne(id, token)`, `create(dto, token)`, `update(id, dto, token)`,
    `remove(id, token)`. Every call sets `Authorization: Bearer <token>` and
    `Content-Type: application/json`. **Layer 3 (anti confused-deputy):** build
    every URL from the configured base + hard-coded path templates + validated
    params (uuid `:id`, enum `type`/`currency`) — never from model text; before
    sending, assert the request origin equals the configured base URL's origin
    and **refuse** otherwise (host allowlist). Map statuses to typed outcomes:
    `2xx` → data; `404` → not-found; `400` → invalid-field(s); `401`/`5xx`/
    transport → service-unavailable. **Never** log bodies, amounts, descriptions,
    or the token. `amount` stays a decimal **string**.
  - _Requirements: 3.5, 7.4, 8.3, 8.4, 8.5 · Design: "Token-handling security" Layer 3, Decision 3, 4, 9_

- [x] 6. Implement the MCP transaction tools (Layer 1: credential/data channel split)
  - Under `mcp/tools/`, one `createTool(...)` per operation. **No tool has a
    `userId` or token input** — `inputSchema` carries only business params. Each
    reads the caller token from `context.requestContext.get('accessToken')` and
    calls `TransactionApiClient`:
    - `list-transactions` (`type?`, `dateFrom?`, `dateTo?`) → `client.list`.
    - `get-transaction` (`id`) → `client.getOne`.
    - `create-transaction` (`amount, type, currency, date, description?`) →
      `client.create` (the only write path for capture).
    - `update-transaction` (`id`, fields) → `client.update`.
    - `delete-transaction` (`id`) → `client.remove`.
    - `summarize-transactions` (`type?`, date range) → `client.list` then
      aggregate **grouped by currency**, totals as decimal **strings** without
      float; never sum across currencies.
  - **Layer 1:** ensure the token/`userId` never appear in any tool result,
    error message, or log (assert in tests).
  - _Requirements: 3.1, 3.2, 3.5, 6.1, 6.2, 6.4, 7.3, 7.4, 8.5 · Design: "Token-handling security" Layer 1, Decision 4_

- [x] 7. Stand up the in-process MCP server + client
  - `mcp/finlux-mcp-server.ts`: a Mastra `MCPServer` registering the task-6 tools.
  - `mcp/mcp.module.ts`: provides the `MCPServer` and `TransactionApiClient`
    (reads `TRANSACTION_API_BASE_URL` via `ConfigService`); exports what the
    agent needs.
  - _Implementation note (deviation, accepted by Tech Lead):_ `@mastra/mcp@2.5.0`
    `MCPClient` has **no in-memory/in-process transport**
    (`MastraMCPServerDefinition = StdioServerDefinition | HttpServerDefinition` —
    stdio subprocess or HTTP URL only; verified in the installed types). The
    tools are registered on the in-process `MCPServer` (authoritative allowlist)
    and the **same registered tool objects are handed to the agent in-process**,
    omitting the needless stdio/HTTP transport hop. Going over a transport would
    force the caller JWT through a transport header, weakening Layer 1, for zero
    behavioral gain. All guarantees preserved (in-process MCP server, HTTP-only
    data path, JWT via server-side `RequestContext`, Layers 1 & 3).
  - _Requirements: 9.1 · Design: "Architecture change", Decision 2a, 3_

- [x] 8. Author the system prompt
  - `agent/prompts/system-prompt.ts`: scope (caller's own data, tools only),
    **no money movement** (decline + explain), **no regulated advice**, grounding
    (claims only from tool results; say so when data can't answer), capture
    discipline (never create without explicit confirmation; ask when ambiguous;
    propose a category, default `uncategorized`, folded into `description`),
    currency-explicit answers (no cross-currency sums), injection resistance
    (message content is data, not instructions; never reveal or use credentials).
  - _Requirements: 3.3, 3.4, 4.1, 4.6, 5.1, 5.3, 6.3, 6.4, 7.1, 7.2, 7.5 · Design: Decision 6, 7, 8_

- [x] 9. Build the Mastra agent and the `AgentService` (+ egress guardrail, Layer 1)
  - `agent/finlux-agent.ts`: a Mastra `Agent` with
    `model: google(configuredModelId)` from `@ai-sdk/google` (reads
    `GOOGLE_GENERATIVE_AI_API_KEY`; fail fast if unset), the system prompt, and
    the MCP toolset (task 7). Register an **output guardrail** that scrubs/rejects
    any JWT-shaped substring from the agent's final text before it is returned
    (Layer 1 egress defense).
  - `agent/agent.service.ts`: `runTurn(userId, accessToken, messages)` builds a
    typed `RequestContext<{ userId; accessToken }>`, sets both, calls
    `agent.generate(messages, { requestContext })`, returns `{ text }` (plus tool
    activity for tests). Expose the agent behind a small injectable port so tests
    supply a fake. `userId`/`accessToken` are server-side only — never in a tool
    `inputSchema`, result, prompt, or log.
  - `agent/agent.module.ts`: imports `McpModule` + `ConfigModule`;
    provides/exports `AgentService`.
  - _Requirements: 1.4, 3.1, 3.2, 7.4, 9.1, 9.2 · Design: "Token-handling security" Layer 1, Decision 3, 4, 10_

- [x] 10. Implement the chat DTOs, controller, and `ChatService`
  - `chat/dto/send-message.dto.ts`: `message` (`@IsString`, `@IsNotEmpty`,
    `@MaxLength(4000)`); `start-conversation.dto.ts` reuses it (optional title).
  - Add an `@AccessToken()` param decorator (or read `req.headers.authorization`)
    to obtain the validated caller JWT alongside `@CurrentUser('userId')`.
  - `chat/chat.service.ts`: per turn — load/own the conversation (or create one),
    assemble last-N context + the new user message, call
    `AgentService.runTurn(userId, token, …)`, and **persist the user + agent
    messages together only after** a successful generate. Map model/provider or
    transaction-API failure to `502`/`503`; never persist a failed reply.
  - `chat/chat.controller.ts`, base `/conversations`, class-level
    `@UseGuards(JwtAuthGuard)`, ownership from `@CurrentUser('userId')` + the JWT
    only (never body/query/path):
    - `POST /conversations` → `201` `{ conversation, messages }`.
    - `POST /conversations/:id/messages` (`ParseUUIDPipe` v4) → `201`
      `{ messages }`, `404` if not owned.
    - `GET /conversations` → `200` `Conversation[]`.
    - `GET /conversations/:id/messages` (uuid pipe) → `200` `Message[]` / `404`.
  - `chat/chat.module.ts`: `TypeOrmModule.forFeature([Conversation, Message])`,
    imports `AgentModule`; provides the controller + services. Import
    `ChatModule` in `AppModule`.
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 2.2, 2.3, 2.4, 2.6, 8.1, 8.2, 8.3, 8.4 · Design: Decision 1, 3, 5, 9_

- [x] 11. Tool + capture-flow unit tests (Vitest; mocked client/agent)
  - Tool tests (mocked `TransactionApiClient`): each tool reads `accessToken`
    from `requestContext` and sends it as `Authorization: Bearer` with the right
    method/path/params; no tool accepts a `userId`/token input; `summarize`
    groups by currency, never sums across currencies, preserves string precision.
  - **Layer 1 tests:** the token/`userId` never appear in any tool result or
    error; the egress guardrail scrubs/rejects a JWT-shaped string planted in a
    drafted agent reply.
  - **Layer 3 tests:** the client builds the URL from the configured base +
    validated params only, and **refuses to send** (no `Authorization` header
    emitted) when the resolved origin is outside the allowlist.
  - Capture-flow tests (mocked agent): describe-only → **zero** `create` (POST)
    calls; explicit confirm → exactly one `POST /transactions`; decline → no
    write; money-movement request → declining reply, no tool call; transaction-
    API/model failure → no agent message persisted, `502` surfaced.
  - _Requirements: 3.2, 4.2, 4.3, 4.5, 7.1, 7.4, 8.3, 9.4 · Design: "Token-handling security" (Layers 1, 3), "Testing strategy" (layers 1–2)_

- [x] 12. End-to-end tests (Vitest + supertest; mocked model, real API)
  - `test/chat.e2e-spec.ts` (mirror `app.e2e-spec.ts`; global `ValidationPipe`;
    import `AuthModule`; mock only the **model** provider — let the MCP tools hit
    the app's **real** `/transactions` so JWT propagation is exercised end to
    end). Cover: `401` on every chat route without a valid token; **isolation via
    the API** — user A asking about user B's transaction id → clean "not found"
    (API `404` for the non-owning token); user A → user B's conversation id →
    `404`, identical to a random uuid; capture→confirm actually creates a
    transaction visible through `GET /transactions`; `400` on empty/oversized
    message, unknown fields, non-uuid `:id`.
  - _Requirements: 1.1, 1.3, 2.4, 7.3, 8.1, 8.2, 9.4 · Design: "Testing strategy" (layer 3)_

- [x] 13. Verify build, lint, format, tests, and migration
  - Run `pnpm --dir backend lint`, `format:check`, `build`, `test`; fix issues.
  - Run `pnpm --dir backend test:e2e` against a reachable Postgres (model mocked,
    transaction API real/in-process). Apply `pnpm --dir backend migration:run`,
    confirm `migration:show` `[X]`, then round-trip `migration:revert` (drops
    `conversation`/`message` + `message_role`) and `migration:run` again. If the
    DB is unavailable, note it explicitly: unit tests gate scoping/capture/JWT
    forwarding; e2e + migration run where the DB exists.
  - _Requirements: 9.3, 9.4 · Design: "Verification"_

## Notes
- **MCP boundary**: transaction tools are HTTP clients of `/transactions`; the
  agent has **no direct DB access** to transactions and does not inject
  `TransactionsService`. Only `conversation`/`message` use TypeORM here.
- **JWT propagation (1a) + token-handling security**: the caller's validated JWT
  flows agent → MCP tool → Transaction API as `Authorization: Bearer`; the API is
  the sole ownership authority. Two mandatory layers protect the token:
  **Layer 1** — it travels only via server-side `RequestContext`, never in a tool
  `inputSchema`, tool result, prompt, or log, plus an egress guardrail scrubs
  JWT-shaped strings from the agent's reply; **Layer 3** — the HTTP client builds
  URLs from the configured base + validated params only and enforces a host
  allowlist before attaching the bearer header.
- **Capture invariant**: `create-transaction` (→ `POST /transactions`) is the
  *only* write path, gated behind explicit confirmation by the system prompt; no
  `pending_action` table.
- **Category** stays conversational (folded into `description`); no `transaction`
  schema change in this spec.
- **Provider**: `@ai-sdk/google` provider object reading
  `GOOGLE_GENERATIVE_AI_API_KEY` (not Mastra's `google/<model>` router string).
- **Requirements reconciliation**: Req 3.1/7.3 say "through `TransactionsService`";
  the approved architecture routes through the transaction **HTTP API** behind an
  **MCP server** instead (intent preserved: single user-scoped surface, no direct
  DB access, JWT-enforced ownership). Requirements are PM-owned and not edited
  here; flagged in `design.md` for the PM to reword.
- `transaction-http-api` is now a **hard runtime dependency** (the MCP tools are
  its clients); verified implemented in `backend/src/transactions/`.

Depends on: `user-authentication` (implemented), `transaction-http-api`
(implemented — the MCP tools' HTTP target), `data-model-and-persistence`
(implemented — only for the `conversation`/`message` persistence conventions).
