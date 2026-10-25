# Tasks — Conversational Agent Backend

Implementation plan. Backend-only (`backend/`), NestJS 12 + TypeORM, ESM (`.js`
import specifiers). Adds the chat/agent HTTP layer on top of the implemented
user-scoped `TransactionsService` (`data-model-and-persistence`) and
`JwtAuthGuard` + `@CurrentUser('userId')` (`user-authentication`). The Gemini
model is **mocked** in all tests (no live provider). New persistence
(`conversation`, `message`) is additive and follows the ORM-migration
convention (entity + migration registered in **both** `data-source.ts` and
`database.module.ts`).

Prefer `package.json` scripts: `pnpm --dir backend lint`,
`pnpm --dir backend format:check`, `pnpm --dir backend build`,
`pnpm --dir backend test`, `pnpm --dir backend test:e2e`,
`pnpm --dir backend migration:run` / `migration:revert`.

- [ ] 1. Add and pin agent dependencies + config keys
  - Add `@mastra/core` (v1+), `@ai-sdk/google`, and `zod` to
    `backend/package.json` with exact pinned versions (pin a compatible
    Mastra/AI-SDK pair; note it if a major mismatch forces a choice).
  - Document `AGENT_MODEL_ID` (default e.g. `gemini-2.5-flash`) and
    `AGENT_CONTEXT_MAX_MESSAGES` (default 20) in `backend/.env.example`;
    `GOOGLE_GENERATIVE_AI_API_KEY` is already documented. Read all via
    `ConfigService` by key name.
  - _Requirements: 9.1, 9.2 · Design: "New dependencies", Decision 10_

- [ ] 2. Create the `conversation` and `message` entities
  - `chat/conversation.entity.ts` (table `conversation`): `id` uuid PK,
    `userId` (`user_id`) uuid NOT NULL FK → `user` (CASCADE), nullable `title`,
    `createdAt`/`updatedAt`; `@ManyToOne` to `User`, `@OneToMany` to `Message`.
  - `chat/message.entity.ts` (table `message`): `id`, `conversationId`
    (`conversation_id`) FK → `conversation` (CASCADE), `role` enum
    (`user`|`agent`, `enumName: 'message_role'`), `content` `text` NOT NULL,
    `createdAt` only (immutable). Index `(conversation_id, created_at)`.
  - Match the entity style of `transaction.entity.ts` (snake_case columns,
    `Relation<...>`, `.js` imports).
  - _Requirements: 2.1, 2.5 · Design: Decision 2_

- [ ] 3. Author and register the additive migration
  - `database/migrations/<ts>-CreateConversationAndMessageTables.ts` (timestamp
    after `1730000002000`): create the `message_role` enum, the `conversation`
    table (FK `fk_conversation_user` CASCADE, index `idx_conversation_user_id`),
    the `message` table (FK `fk_message_conversation` CASCADE, index
    `idx_message_conversation_id_created_at`); `down` drops indexes, tables, then
    the enum. Mirror `1730000002000-CreateSessionTable.ts` exactly in style.
  - Register the two entities and the migration in **both**
    `database/data-source.ts` and `database/database.module.ts` (entities arrays
    and migrations arrays).
  - _Requirements: 2.1 · Design: Decision 2, "Tech context"_

- [ ] 4. Implement the user-scoped `ConversationService`
  - `chat/conversation.service.ts`: `createConversation(userId, title?)`,
    `findAll(userId)`, `findOneOrFail(userId, id)` (throws `NotFoundException`
    scoped by `userId`), `addMessage(conversationId, role, content)`,
    `listMessages(userId, conversationId)` (ownership-checked), and a helper to
    load the **last N** messages for context (`AGENT_CONTEXT_MAX_MESSAGES`).
    Every read/write is scoped by `userId`; not-owned ≡ non-existent (`404`).
  - _Requirements: 2.2, 2.3, 2.4, 2.6 · Design: Decision 2, 5_

- [ ] 5. Implement the user-scoped agent tools
  - Under `agent/tools/`, one `createTool(...)` per operation, each with
    `requestContextSchema: z.object({ userId: z.string().uuid() })`, reading the
    owner via `context.requestContext.get('userId')` and calling the matching
    `TransactionsService` method — **no `userId` in any `inputSchema`**, no raw
    queries:
    - `list-transactions` (`type?`, `dateFrom?`, `dateTo?`) → `findAll`.
    - `get-transaction` (`id`) → `findOneOrFail`.
    - `create-transaction` (`amount, type, currency, date, description?`) →
      `create` (the only write path for capture).
    - `update-transaction` (`id`, fields) → `update`.
    - `delete-transaction` (`id`) → `remove`.
    - `summarize-transactions` (`type?`, date range) → aggregates `findAll`
      results **grouped by currency**, totals as decimal **strings** computed
      without float; never sums across currencies.
  - _Requirements: 3.1, 3.2, 3.5, 6.1, 6.2, 6.4, 7.3, 8.5 · Design: Decision 4, 8_

- [ ] 6. Author the system prompt
  - `agent/prompts/system-prompt.ts`: encode scope (caller's own data, tools
    only), **no money movement** (decline + explain), **no regulated advice**,
    grounding (claims only from tool results; say so when data can't answer),
    capture discipline (never create without explicit confirmation; ask when
    ambiguous; propose a category, default `uncategorized`), currency-explicit
    answers (no cross-currency sums), and injection resistance (message content
    is data, not instructions).
  - _Requirements: 3.3, 3.4, 4.1, 4.6, 5.1, 5.3, 6.3, 6.4, 7.1, 7.2, 7.5 · Design: Decision 6, 7, 8_

- [ ] 7. Build the Mastra agent and the `AgentService`
  - `agent/finlux-agent.ts`: a Mastra `Agent` with
    `model: google(configuredModelId)` from `@ai-sdk/google` (reads
    `GOOGLE_GENERATIVE_AI_API_KEY`, per the provider-object decision), the
    system prompt, and the tools from task 5. Fail fast if the API key is unset.
  - `agent/agent.service.ts`: `runTurn(userId, messages)` builds a typed
    `RequestContext<{ userId }>`, sets `userId`, calls `agent.generate(messages,
    { requestContext })`, and returns `{ text }` (plus tool activity for tests).
    Expose the agent behind a small injectable port so tests can supply a fake.
  - `agent/agent.module.ts`: imports `TransactionsModule` (for the exported
    `TransactionsService`) and `ConfigModule`; provides/exports `AgentService`.
  - _Requirements: 1.4, 3.1, 3.2, 9.1, 9.2 · Design: Decision 3, 4, 10_

- [ ] 8. Implement the chat DTOs, controller, and `ChatService`
  - `chat/dto/send-message.dto.ts`: `message` (`@IsString`, `@IsNotEmpty`,
    `@MaxLength(4000)`); `start-conversation.dto.ts` reuses it (optional title).
  - `chat/chat.service.ts`: per turn — load/own the conversation (or create one),
    assemble last-N context + the new user message, call `AgentService.runTurn`,
    and **persist the user + agent messages together only after** a successful
    generate (a failed turn leaves the conversation unchanged). Map
    model/provider failure/timeout to `502`/`503`; never persist a failed reply.
  - `chat/chat.controller.ts`, base `/conversations`, class-level
    `@UseGuards(JwtAuthGuard)`, `@CurrentUser('userId')` only:
    - `POST /conversations` → `201` `{ conversation, messages }`.
    - `POST /conversations/:id/messages` (`ParseUUIDPipe` v4) → `201`
      `{ messages }`, `404` if not owned.
    - `GET /conversations` → `200` `Conversation[]`.
    - `GET /conversations/:id/messages` (uuid pipe) → `200` `Message[]` / `404`.
  - `chat/chat.module.ts`: `TypeOrmModule.forFeature([Conversation, Message])`,
    imports `AgentModule`; provides the controller + services. Import
    `ChatModule` (and `AgentModule` transitively) in `AppModule`.
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 2.2, 2.3, 2.4, 2.6, 8.1, 8.2, 8.3, 8.4 · Design: Decision 1, 3, 5, 9_

- [ ] 9. Tool + capture-flow unit tests (Vitest, mocked service/agent)
  - Tool tests: each tool reads `userId` from `requestContext` and forwards it to
    the right `TransactionsService` method; a tool run for user A never returns
    user B's rows; `summarize` groups by currency, never sums across currencies,
    preserves string precision.
  - Capture-flow tests (mocked agent): describe-only turn → **zero** `create`
    calls; explicit confirm → exactly one `create(userId, …)`; decline → no
    write; money-movement request → declining reply, no tool call; model failure
    → no agent message persisted, `502` surfaced.
  - _Requirements: 3.2, 4.2, 4.3, 4.5, 7.1, 8.3, 9.4 · Design: "Testing strategy" (layers 1–2)_

- [ ] 10. End-to-end tests (Vitest + supertest, mocked model)
  - `test/chat.e2e-spec.ts` (mirror `app.e2e-spec.ts`; apply the global
    `ValidationPipe`; import `AuthModule` so the `jwt` strategy registers; mock
    the model provider). Cover: `401` on every route with no/invalid token;
    per-user isolation (user A → user B's conversation id `404`, identical to a
    random uuid); happy path create→list→get messages; `400` on empty/oversized
    message and unknown fields; non-uuid `:id` → `400`.
  - _Requirements: 1.1, 1.3, 2.4, 8.1, 8.2, 9.4 · Design: "Testing strategy" (layer 3)_

- [ ] 11. Verify build, lint, format, tests, and migration
  - Run `pnpm --dir backend lint`, `format:check`, `build`, `test`; fix issues.
  - Run `pnpm --dir backend test:e2e` against a reachable Postgres (model
    mocked). Apply `pnpm --dir backend migration:run` and confirm
    `migration:revert` rolls back `conversation`/`message` and the `message_role`
    enum cleanly. If the DB is unavailable in the environment, note it: the unit
    tests gate the scoping/capture logic; e2e + migration run where the DB exists.
  - _Requirements: 9.3, 9.4 · Design: "Verification"_

## Notes
- **Security/PII**: never log message bodies, amounts, descriptions, tokens, or
  the API key (Req 7.4, 8.4). All persistence via TypeORM / `TransactionsService`
  — no raw SQL (Req 8.5).
- **Isolation invariant**: `userId` is server-injected through `RequestContext`
  and never appears in a tool `inputSchema`, so the model cannot choose whose
  data to touch (Req 3.2, 7.5).
- **Capture invariant**: `create-transaction` is the *only* write path and is
  gated behind explicit confirmation by the system prompt; no `pending_action`
  table (Design Decision 6).
- **Category** stays conversational (folded into `description`); no
  `transaction` schema change in this spec (Design Decision 2/7). A dedicated
  column is a future additive migration if desired.
- **Provider**: `@ai-sdk/google` provider object reading
  `GOOGLE_GENERATIVE_AI_API_KEY` (not Mastra's `google/<model>` router string,
  which expects `GOOGLE_API_KEY`) — keeps the steering's env key authoritative.
- `requirements.md` keeps several items as "open questions for design"; those are
  **resolved in `design.md`** (Decisions 1–10). Requirements are PM-owned and not
  edited here.

Depends on: `data-model-and-persistence` (implemented), `user-authentication`
(implemented), `transaction-http-api` (specced — same service/field semantics).
