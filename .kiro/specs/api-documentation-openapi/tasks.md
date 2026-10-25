# Tasks — API Documentation (OpenAPI)

Implementation plan. Backend-only (`backend/`), NestJS 12 + `@nestjs/swagger`,
ESM (`.js` import specifiers). **Additive documentation only** — no business
endpoint, auth, data-model, or agent behavior changes. Serves a code-derived
OpenAPI 3.x document + Swagger UI, environment-gated.

Prefer `package.json` scripts: `pnpm --dir backend lint`,
`pnpm --dir backend build`, `pnpm --dir backend format:check`,
`pnpm --dir backend test`.

- [ ] 1. Add and pin the dependency
  - Add `"@nestjs/swagger": "12.0.4"` to `backend/package.json` `dependencies`
    (exact pin; peer `@nestjs/*` `^12`, `typescript ^6` already satisfied).
    Install via pnpm under Node 24.22.1. No other new dependency (Express UI
    ships with `SwaggerModule`).
  - _Requirements: 7.1 · Design: Dependency, Decision 1_

- [ ] 2. Enable the Swagger CLI plugin
  - In `nest-cli.json`, add `compilerOptions.plugins: ["@nestjs/swagger"]` with
    `introspectComments: true`, so request DTO fields and JSDoc are inferred
    into OpenAPI metadata without changing `class-validator` behavior.
  - _Requirements: 7.2 · Design: Decision 3_

- [ ] 3. Add response model DTO classes (documentation-only)
  - `auth/dto/responses/public-user.response.dto.ts` (`PublicUserResponseDto`:
    id, email, displayName nullable, createdAt, updatedAt — no password).
  - `auth/dto/responses/login.response.dto.ts` (`LoginResponseDto`:
    `accessToken` + `user: PublicUserResponseDto`).
  - `transactions/dto/responses/transaction.response.dto.ts`
    (`TransactionResponseDto` mirroring the entity: `amount` as a **string**
    with a decimal example, `date` `YYYY-MM-DD`, `type`/`currency` enums,
    `description` nullable, `createdAt`/`updatedAt` ISO strings).
  - Annotate with `@ApiProperty`; non-sensitive example values only. These are
    not wired into validation or services.
  - _Requirements: 4.1, 4.2, 5.3, 5.4 · Design: Decisions 3, 7_

- [ ] 4. Annotate request DTO password fields as write-only
  - On `RegisterDto.password` and `LoginDto.password`, add
    `@ApiProperty({ writeOnly: true, format: 'password', example: '...' })` so
    the credential appears only in request schemas, never in responses. Do not
    alter any validation decorator.
  - _Requirements: 5.1, 5.4 · Design: Decision 7_

- [ ] 5. Decorate the controllers
  - `AuthController`: `@ApiTags('auth')`; per handler `@ApiOperation` +
    `@ApiCreatedResponse(PublicUserResponseDto)` / `@ApiOkResponse(
    LoginResponseDto)` and documented `@ApiConflictResponse` (409),
    `@ApiBadRequestResponse` (400), `@ApiUnauthorizedResponse` (401, generic).
  - `TransactionsController`: `@ApiTags('transactions')` +
    `@ApiBearerAuth('bearer')` at class level; per handler the correct
    `@ApiCreatedResponse`/`@ApiOkResponse(TransactionResponseDto)` /
    `@ApiNoContentResponse` (204) and `@ApiBadRequestResponse` (400),
    `@ApiUnauthorizedResponse` (401), `@ApiNotFoundResponse` (404, identical for
    not-found/not-owned).
  - `AppController`: `@ApiTags('app')` + `@ApiOperation` (trivial).
  - Error responses are bare status entries — no sensitive bodies.
  - _Requirements: 1.2, 2.2, 3.2, 4.2, 5.2 · Design: Decisions 3, 4, 7_

- [ ] 6. Implement the gated OpenAPI setup
  - `src/openapi/setup-openapi.ts`: `setupOpenApi(app, configService)` that
    builds the document with `DocumentBuilder` — title "Finlux API", description,
    version from `package.json`, and `.addBearerAuth({ type:'http',
    scheme:'bearer', bearerFormat:'JWT' }, 'bearer')` — then
    `SwaggerModule.createDocument` + `SwaggerModule.setup('docs', app, doc)`
    (UI at `/docs`, JSON at `/docs-json`). Gate: serve when
    `API_DOCS_ENABLED === 'true'`, OR unset AND `NODE_ENV !== 'production'`;
    otherwise no-op (do not mount). Export the gate predicate for testing.
  - _Requirements: 1.1, 1.3, 1.4, 2.1, 3.1, 4.3, 6.1, 6.2, 6.3 · Design:
    Decisions 2, 4, 5, 6_

- [ ] 7. Wire setup into bootstrap and document the env key
  - In `src/main.ts`, call `setupOpenApi(app, app.get(ConfigService))` after the
    global `ValidationPipe` and before `app.listen`.
  - In `backend/.env.example`, document `API_DOCS_ENABLED` (no value) with a
    one-line note on the non-prod default and that production exposure requires
    `API_DOCS_ENABLED=true`.
  - _Requirements: 6.1, 6.2 · Design: Decision 5_

- [ ] 8. Unit tests (Vitest)
  - `src/openapi/setup-openapi.spec.ts`: build the document from a Nest test app
    and assert — paths for `/auth/register`, `/auth/login`, `/transactions`,
    `/transactions/{id}`; `/transactions*` require the `bearer` scheme and
    `/auth/*` do not; a `bearer` security scheme is declared; no response schema
    has a `password` property; title "Finlux API" and version == `package.json`.
    Test the gate predicate for all four combinations (enabled explicit, unset
    non-prod → on; unset prod, explicit false → off).
  - _Requirements: 3.1, 3.2, 4.3, 5.4, 6.1, 6.2, 6.3, 7.4_

- [ ] 9. Verify build, lint, format, and tests
  - Run `pnpm --dir backend lint`, `format:check`, `build` (also proves the CLI
    plugin is wired), and `test`; fix any issues. Manually confirm `GET /docs`
    serves the UI and `GET /docs-json` returns JSON with the `bearer` scheme and
    the auth/transactions paths when enabled, and that both are absent when
    `API_DOCS_ENABLED` is unset with `NODE_ENV=production`.
  - _Requirements: 7.3, 7.4 · Design: Verification_

## Notes
- No existing endpoint behavior changes; annotations and the response DTOs are
  additive and documentation-only.
- No secrets/PII/tokens in any example or schema; `password` is write-only and
  absent from responses.
- `requirements.md` leaves tooling/routes/annotation/exposure/version as "open
  questions for design"; those are **resolved in `design.md`** (Decisions 1–7)
  and are authoritative. Requirements are PM-owned and not edited here.

Depends on (documents their endpoints; all implemented): `user-authentication`,
`transaction-http-api`, `data-model-and-persistence`.
