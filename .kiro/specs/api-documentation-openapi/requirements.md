# Requirements — API Documentation (OpenAPI)

## Overview
Provide machine- and human-readable documentation of the Finlux backend HTTP
API using the **OpenAPI** standard, served by the NestJS backend. Today the
API surface (`/auth/*`, `/transactions/*`) is only described in spec documents;
there is no live, navigable contract. This feature adds an accurate, always
up-to-date OpenAPI description of the existing endpoints plus an interactive
documentation UI, so that frontend and future integrators can discover and call
the API without reading source code.

This is a **backend documentation/observability feature**. It describes the API
that already exists; it does **not** add, remove, or change any business
endpoint, auth behavior, data model, or agent logic.

## Terminology
- **OpenAPI document**: the standard (OpenAPI 3.x) JSON/YAML description of the
  API — its paths, operations, parameters, request/response schemas, and
  security schemes.
- **API docs UI**: the interactive, browser-based view rendered from the
  OpenAPI document (e.g. a Swagger-style page) where a developer can read and
  try endpoints.
- **Protected endpoint**: an endpoint requiring a valid bearer JWT, per
  `user-authentication` (e.g. all `/transactions` routes).
- **Public endpoint**: an endpoint callable without a token (e.g.
  `POST /auth/register`, `POST /auth/login`).

## Current API surface to be documented (consumed, not defined here)
As implemented in prior specs; this feature documents exactly these and any
later-added endpoints:
- `POST /auth/register` — public; `201` → public user; `409` duplicate email;
  `400` validation (`user-authentication`).
- `POST /auth/login` — public; `200` → `{ accessToken, user }`; `401` generic
  invalid credentials; `400` validation (`user-authentication`).
- `GET|POST /transactions`, `GET|PUT|DELETE /transactions/:id` — protected
  (bearer JWT); status codes per `transaction-http-api`
  (`201`/`200`/`204`/`400`/`401`/`404`).

## Scope
In scope:
- Generating an **OpenAPI 3.x document** describing the backend's HTTP API,
  derived from the actual NestJS endpoints and DTOs so it stays in sync with the
  code.
- Serving an **interactive API docs UI** from the backend at a dedicated route.
- Exposing the raw OpenAPI document (JSON, and optionally YAML) at a stable
  endpoint for tooling/codegen.
- Documenting, per operation: path, method, parameters, request body schema,
  response schemas per status code, and which endpoints require authentication.
- Declaring the **bearer JWT** security scheme so protected endpoints are marked
  as such and the UI can send an `Authorization` header when trying them.
- Accurate metadata: API title ("Finlux API"), description, and version.
- Controlling **where/whether** the docs are exposed by environment
  (configurable), appropriate for a finance application.

Out of scope:
- Any change to business endpoints, request/response behavior, auth, the data
  model, migrations, or the agent layer.
- Publishing the docs to an external portal or third-party hosting.
- Client SDK generation (the raw OpenAPI document enables it downstream, but
  generating/publishing SDKs is not part of this feature).
- Authentication/authorization for the docs UI beyond a simple
  enable/disable-by-environment control (any stronger gating is a later spec if
  needed).
- Frontend/UI work in the Next.js app.
- Documenting internal-only concerns (DB schema internals, secrets, the agent's
  private prompts/tools) — see Requirement 5.

## Requirements

### Requirement 1 — OpenAPI document generated from the code
**User story:** As a developer integrating with Finlux, I want an accurate
OpenAPI description of the API, so that I can understand and call it correctly.

Acceptance criteria (EARS):
1. THE SYSTEM SHALL produce an OpenAPI 3.x document that describes the backend's
   HTTP endpoints, derived from the actual NestJS controllers/DTOs (not a
   separately hand-maintained file that can drift).
2. THE OpenAPI document SHALL include, for every documented operation, its HTTP
   method, path, parameters, request body schema (where applicable), and the
   response schema(s) for its success and documented error status codes.
3. WHEN an endpoint is added, removed, or its DTO changes, THE regenerated
   document SHALL reflect that change without manual edits to a parallel
   specification.
4. THE OpenAPI document SHALL be available in a standard serialized form (JSON)
   at a stable backend route for tooling and codegen.

### Requirement 2 — Interactive documentation UI
**User story:** As a developer, I want a browser page to read and try the API,
so that I can explore endpoints quickly.

Acceptance criteria (EARS):
1. THE SYSTEM SHALL serve an interactive API documentation UI, rendered from the
   OpenAPI document, at a dedicated backend route.
2. THE UI SHALL list the available operations grouped logically (e.g. by
   resource/tag such as "auth" and "transactions") with their descriptions.
3. THE UI SHALL allow a developer to issue a test request to an endpoint,
   including supplying a bearer token for protected endpoints.

### Requirement 3 — Authentication represented correctly
**User story:** As a developer, I want the docs to show which endpoints need
authentication, so that I know when a token is required.

Acceptance criteria (EARS):
1. THE OpenAPI document SHALL declare a **bearer JWT** security scheme matching
   the backend's `Authorization: Bearer <token>` scheme.
2. THE document SHALL mark protected endpoints (e.g. all `/transactions` routes)
   as requiring that security scheme, and SHALL leave public endpoints
   (`/auth/register`, `/auth/login`) unmarked.
3. THE UI SHALL provide a way to enter a bearer token once and apply it to
   "try it out" calls against protected endpoints.

### Requirement 4 — Accurate, discoverable contract
**User story:** As a developer, I want the documented contract to match reality,
so that I can trust it.

Acceptance criteria (EARS):
1. THE documented request/response schemas SHALL match the backend's actual DTOs
   and entity responses, including that monetary `amount` is a decimal
   **string** (never a float) and `date` is a `YYYY-MM-DD` string, consistent
   with `transaction-http-api`.
2. THE documented status codes per operation SHALL match the implemented
   behavior (e.g. `201` create, `200` read/update, `204` delete, `400`
   validation, `401` unauthenticated, `404` not found / not owned).
3. THE document SHALL carry accurate API metadata: a title ("Finlux API"), a
   short description, and a version identifier.

### Requirement 5 — Safety and non-disclosure (finance app)
**User story:** As the product owner, I want the docs to avoid leaking sensitive
details, so that exposing the contract does not weaken security.

Acceptance criteria (EARS):
1. THE documentation SHALL NOT expose secrets, credentials, tokens, connection
   strings, or environment values in examples, schemas, or metadata.
2. THE documentation SHALL NOT contradict the backend's non-disclosure behavior:
   the login failure SHALL be shown as a single generic error (no field-level
   disclosure), and "not found vs not owned" SHALL be represented identically as
   `404` (consistent with `user-authentication` and `transaction-http-api`).
3. WHERE example values are shown, THE SYSTEM SHALL use non-sensitive
   placeholder data (no real PII, no real credentials).
4. THE password field and any credential field SHALL be represented as a
   write-only/secret-style input and SHALL NOT appear in any response schema or
   example (consistent with the backend never returning `password`).

### Requirement 6 — Environment-gated exposure
**User story:** As an operator, I want to control whether the docs are reachable
per environment, so that I can keep them available in development without
necessarily exposing them in production.

Acceptance criteria (EARS):
1. THE SYSTEM SHALL make the docs UI and the raw OpenAPI endpoint's availability
   **configurable via environment** (enabled/disabled), read by key name from
   the environment and documented in `backend/.env.example`.
2. THE default behavior SHALL be safe for a finance application: the chosen
   default (and how to enable/disable per environment) SHALL be stated so that
   production exposure is a deliberate, documented decision rather than an
   accident.
3. WHEN the docs are disabled by configuration, THE SYSTEM SHALL NOT serve the
   UI or the raw document, and the rest of the API SHALL behave unchanged.

### Requirement 7 — Stack alignment and quality
**User story:** As a developer, I want the feature to fit the project's stack
and pass its checks.

Acceptance criteria (EARS):
1. THE implementation SHALL align with `.kiro/steering/tech.md` (NestJS backend,
   ESM with `.js` import specifiers) and use the NestJS-native OpenAPI
   integration; any added dependency SHALL be pinned and resolve to the
   project's `@nestjs/*` 12.x line.
2. THE implementation SHALL NOT change the behavior of any existing endpoint;
   adding documentation annotations SHALL be additive only.
3. THE implementation SHALL pass `pnpm --dir backend lint`,
   `pnpm --dir backend format:check`, `pnpm --dir backend build`, and
   `pnpm --dir backend test`.
4. THE implementation SHALL include a check (automated where practical) that the
   OpenAPI document is generated and the documented operations include at least
   the current `/auth/*` and `/transactions/*` endpoints with their security
   markings.

## Open questions / decisions for design
Flagged for the Tech Lead / Solution Architect to resolve in `design.md`; the
requirements above are intentionally agnostic to them:
- **Tooling**: which NestJS-native OpenAPI package/UI to use and its pinned
  version (the `@nestjs/*` OpenAPI integration with a Swagger-style UI is the
  natural fit, but the exact package and renderer are a design choice).
- **Routes**: the exact paths for the UI and the raw document (e.g. a docs path
  and a JSON path) and whether a YAML form is also served.
- **Annotation strategy**: how much is inferred automatically (via the Nest
  compiler plugin / DTO metadata) vs explicit decorators on controllers/DTOs,
  and how to keep DTOs (currently `class-validator` classes) annotated without
  changing validation behavior.
- **Default exposure**: the concrete default (e.g. enabled in non-production,
  disabled or gated in production) and the env key name/semantics for toggling.
- **Versioning**: how the API `version` string is sourced (e.g. from
  `package.json`) and whether it tracks a future API-versioning scheme.

## Status
- Requirements: drafted, ready for review.
- Design (`design.md`): not started — pending Tech Lead (architecture) informed
  by the Solution Architect.
- Tasks (`tasks.md`): not started — pending design.

Depends on (documents their endpoints; all implemented): `user-authentication`,
`transaction-http-api`, `data-model-and-persistence`. Complementary to (not
blocked by) `conversational-agent-backend`, whose future endpoints should also
be documented through the same mechanism once they exist.
