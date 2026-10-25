# Design — API Documentation (OpenAPI)

## Goal
Serve an accurate, code-derived **OpenAPI 3.x** description of the Finlux
backend HTTP API plus an interactive Swagger UI, using the NestJS-native
`@nestjs/swagger` integration. The document is generated from the actual
controllers/DTOs so it cannot drift. Exposure is **environment-gated** and
defaults to safe behavior for a finance app. This is additive documentation
only: **no business endpoint, auth, data-model, or agent behavior changes.**

Authored by the Tech Lead. Resolves the open questions in `requirements.md` and
is authoritative for implementation.

## Tech context (verified against the codebase)
- NestJS 12 on Node 24.22.1, ESM (`"type": "module"`), all intra-project
  imports use explicit `.js` specifiers. Express platform
  (`@nestjs/platform-express`), not Fastify.
- Global `ValidationPipe` (`whitelist`, `forbidNonWhitelisted`, `transform`) is
  set up in `src/main.ts`; config via `@nestjs/config` `ConfigService`.
- Existing endpoints to document (verified):
  - `AuthController` (`/auth`): `POST /auth/register` → `201` `PublicUser`
    (`409` duplicate, `400` validation); `POST /auth/login` → `200`
    `{ accessToken, user: PublicUser }` (`401` generic, `400`).
  - `TransactionsController` (`/transactions`, class-level `JwtAuthGuard`):
    `POST` `201`+`Location`, `GET` collection `200`, `GET/:id` `200`,
    `PUT/:id` `200`, `DELETE/:id` `204`; `400`/`401`/`404` as implemented.
  - `AppController` (`GET /`) → `200` "Hello World!" (trivial; tagged `app`).
- DTOs are `class-validator` classes: `RegisterDto`, `LoginDto`,
  `CreateTransactionDto` (reused by PUT), `ListTransactionsQueryDto`. Response
  shapes `PublicUser` / `LoginResult` are **interfaces** in `auth.service.ts`
  (not classes) and the transaction response is the `Transaction` **entity**.
- Auth is a bearer JWT via `ExtractJwt.fromAuthHeaderAsBearerToken()`.

## Dependency (pinned)
- **`@nestjs/swagger@12.0.4`** — latest stable; peer deps `@nestjs/common` /
  `@nestjs/core` `^12.0.0` (matches the project's 12.x line), `typescript`
  `^6.0.0` (project uses `^6.0.2`), and `class-validator` /
  `class-transformer` / `reflect-metadata` (already present). Added to
  `dependencies` with an exact pin `"@nestjs/swagger": "12.0.4"`.
- The Swagger UI assets ship with `@nestjs/swagger`'s `SwaggerModule.setup`
  (Express); **no `swagger-ui-express` needed** and no Fastify `@fastify/static`
  (that optional peer does not apply on Express). No other new dependency.

## Resolved decisions (close the requirements' open questions)

### Decision 1 — Tooling & renderer
Use `@nestjs/swagger` with its built-in Swagger UI via `SwaggerModule`
(`DocumentBuilder` → `SwaggerModule.createDocument` → `SwaggerModule.setup`).
It is the NestJS-native, first-party integration (Req 7.1) and reads the
existing `class-validator` DTO metadata.

### Decision 2 — Routes
- Swagger UI: **`GET /docs`**.
- Raw OpenAPI JSON: **`GET /docs-json`** (the default JSON path
  `SwaggerModule.setup` mounts next to the UI path; stable for codegen,
  Req 1.4).
- **YAML is not served** (JSON satisfies tooling; YAML would be extra surface
  for no requirement). Noted so the omission is deliberate.

### Decision 3 — Annotation strategy: CLI plugin + targeted decorators
- Enable the **`@nestjs/swagger` CLI plugin** in `nest-cli.json`
  (`compilerOptions.plugins: ["@nestjs/swagger"]`) with
  `introspectComments: true`. The plugin infers `@ApiProperty` from DTO
  properties/types and JSDoc, so the request DTOs (`RegisterDto`, `LoginDto`,
  `CreateTransactionDto`, `ListTransactionsQueryDto`) are documented **without
  hand-annotating every field** and without touching `class-validator`
  behavior (the plugin only augments OpenAPI metadata — Req 7.2).
- **Response shapes** need explicit model classes because the plugin cannot
  infer from TS interfaces/entities returned by handlers:
  - Add lightweight **response DTO classes** annotated with `@ApiProperty`:
    `PublicUserResponseDto`, `LoginResponseDto` (wraps `accessToken` +
    `PublicUserResponseDto`), and `TransactionResponseDto` (mirrors the
    `Transaction` entity: `amount` documented as a **string** with a decimal
    example, `date` as a `YYYY-MM-DD` string, enums for `type`/`currency`,
    `description` nullable, timestamps as ISO strings). These are
    **documentation-only** types; handlers keep returning what they return today
    (the shapes match structurally, so no runtime change).
- Controllers get **minimal, high-value decorators** only:
  - `@ApiTags('auth' | 'transactions' | 'app')` for grouping (Req 2.2).
  - `@ApiOperation({ summary })` per handler.
  - `@ApiResponse`/`@ApiCreatedResponse`/`@ApiOkResponse`/`@ApiNoContentResponse`
    with the correct status codes and `type` set to the response DTOs, plus
    documented error codes (`400/401/404/409`) as bare status entries (no
    sensitive bodies) — Req 1.2, 4.2.
  - `@ApiBearerAuth('bearer')` on `TransactionsController` (class-level) so the
    protected routes carry the security requirement (Req 3.2).

### Decision 4 — Security scheme (bearer JWT)
In `DocumentBuilder`: `.addBearerAuth({ type: 'http', scheme: 'bearer',
bearerFormat: 'JWT' }, 'bearer')`. The named scheme `'bearer'` is referenced by
`@ApiBearerAuth('bearer')` on the protected controller. Public endpoints
(`/auth/*`, `GET /`) carry **no** security requirement (Req 3.2). The UI's
"Authorize" button lets a developer paste a token once and apply it to
"try it out" calls (Req 2.3, 3.3).

### Decision 5 — Environment-gated exposure (Req 6)
- New env key **`API_DOCS_ENABLED`** (boolean-ish string), read via
  `ConfigService` by key name, documented in `backend/.env.example`.
- **Default: enabled when `NODE_ENV !== 'production'`, disabled in
  production.** Precisely: docs are served when `API_DOCS_ENABLED === 'true'`,
  OR when `API_DOCS_ENABLED` is unset AND `NODE_ENV !== 'production'`. So in
  production the docs are **off unless explicitly** `API_DOCS_ENABLED=true` —
  making production exposure a deliberate, documented choice (Req 6.2).
- When disabled, `SwaggerModule.setup` is **not called**, so neither `/docs`
  nor `/docs-json` is mounted; the rest of the API is unchanged (a request to
  those paths falls through to the normal 404) — Req 6.3.
- The toggle lives in `src/main.ts` during bootstrap (after the global pipe,
  before `listen`), in a small `setupOpenApi(app, config)` helper
  (`src/openapi/setup-openapi.ts`) so `main.ts` stays lean and the logic is
  unit-testable.

### Decision 6 — API metadata & version
`DocumentBuilder` sets title **"Finlux API"**, a short description, and a
version. **Version is sourced from `package.json`'s `version`** (currently
`0.0.1`), imported via a JSON import assertion (ESM) or read through
`ConfigService`/`process`, so the docs version tracks the package without a
second source of truth (Req 4.3). No formal API-versioning scheme (URI/header
versioning) is introduced here — out of scope.

### Decision 7 — Non-disclosure & safety in the document (Req 5)
- Password fields: `RegisterDto.password` / `LoginDto.password` annotated
  `@ApiProperty({ writeOnly: true, format: 'password', example:
  'S3cur3P@ss' })`; they appear only in request schemas, never in any response
  DTO (the response DTOs simply omit `password`) — Req 5.4.
- Login failure is documented as a **single generic `401`** with no field-level
  disclosure; `404` for transactions is documented identically for
  "not found" and "not owned" (one `@ApiNotFoundResponse`) — Req 5.2.
- All `@ApiProperty` examples use **non-sensitive placeholders** (sample emails,
  `amount: '20.00'`, `currency: 'COP'`, a fake uuid) — never real PII, tokens,
  secrets, or connection strings — Req 5.1, 5.3.
- No schema or example references env values or internal infrastructure.

## File / module structure
```
backend/
├── nest-cli.json                         # MODIFIED — add @nestjs/swagger plugin
├── package.json                          # MODIFIED — add @nestjs/swagger 12.0.4
├── .env.example                          # MODIFIED — document API_DOCS_ENABLED
├── src/
│   ├── main.ts                           # MODIFIED — call setupOpenApi(app)
│   └── openapi/
│       ├── setup-openapi.ts              # NEW — DocumentBuilder + gated setup
│       └── setup-openapi.spec.ts         # NEW — unit tests for the gate + doc
│   ├── auth/
│   │   ├── auth.controller.ts            # MODIFIED — @ApiTags/@ApiOperation/@ApiResponse
│   │   └── dto/
│   │       ├── register.dto.ts           # MODIFIED — writeOnly password, examples
│   │       ├── login.dto.ts              # MODIFIED — writeOnly password, examples
│   │       └── responses/                # NEW — response model classes
│   │           ├── public-user.response.dto.ts
│   │           └── login.response.dto.ts
│   └── transactions/
│       ├── transactions.controller.ts    # MODIFIED — tags/operations/responses/@ApiBearerAuth
│       └── dto/
│           └── responses/
│               └── transaction.response.dto.ts   # NEW
```
The response DTOs live beside their feature; they are documentation models only
and are not wired into validation or the services.

## Testing strategy (Req 7.3, 7.4)
- **Unit** (`setup-openapi.spec.ts`, Vitest): build the OpenAPI document from a
  Nest test app and assert, without a running server:
  - the document contains paths for `/auth/register`, `/auth/login`,
    `/transactions`, `/transactions/{id}`;
  - `/transactions*` operations carry the `bearer` security requirement and
    `/auth/*` do **not** (Req 7.4, 3.2);
  - a `bearer` security scheme is declared (Req 3.1);
  - no response schema contains a `password` property (Req 5.4);
  - title is "Finlux API" and version equals `package.json` version (Req 4.3).
  - the gate helper: returns/serves when enabled (`API_DOCS_ENABLED=true` or
    unset + non-prod) and is a no-op when disabled (unset + prod, or
    `=false`) — Req 6.1–6.3.
- **Lint/format/build/test** all pass (Req 7.3). The CLI plugin runs during
  `nest build`, so a green build also proves the plugin is wired.
- No e2e is strictly required, but an optional smoke check (`GET /docs-json`
  returns `200` and valid JSON when enabled; the route is absent when disabled)
  may be added to the e2e suite.

## Verification
- `pnpm --dir backend lint`, `format:check`, `build`, `test` pass.
- With docs enabled, `GET /docs` serves the UI and `GET /docs-json` returns the
  OpenAPI JSON including the `bearer` scheme and the auth/transactions paths.
- With `API_DOCS_ENABLED` unset and `NODE_ENV=production`, `/docs` and
  `/docs-json` are not mounted and the rest of the API is unaffected.
- Spot-check: `password` never appears in a response schema/example; `amount` is
  typed as `string` with a decimal example; protected routes show the lock /
  `security` requirement.

## Out of scope (restated)
No change to any business endpoint, auth, data model, migrations, or agent
behavior; no external doc portal; no client SDK generation/publishing; no
stronger docs-UI auth beyond the env toggle; no YAML output; no API-versioning
scheme; no frontend work.

## Status
- Requirements: drafted (PM).
- Design: **complete (Tech Lead).** Open questions resolved above
  (Decisions 1–7).
- Tasks (`tasks.md`): written (Tech Lead) — ready to implement.

Depends on (documents their endpoints; all implemented): `user-authentication`,
`transaction-http-api`, `data-model-and-persistence`. Future
`conversational-agent-backend` endpoints will be documented through the same
mechanism once they exist.
