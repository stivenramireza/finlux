# Requirements — Transaction HTTP API

## Overview
Expose the user's transactions over an authenticated HTTP REST API so the
frontend (and, later, the agent layer) can **create, read, update, and delete**
transactions that belong to the currently logged-in user. This spec adds the
**HTTP layer only** on top of the already-implemented persistence and auth:

- `data-model-and-persistence` already provides the `transaction` table and a
  fully **user-scoped `TransactionsService`** (`create`, `findAll` with
  optional `type`/date filters, `findOne`/`findOneOrFail`, `update`, `remove` —
  physical delete), where every method takes `userId` and applies it in the
  `WHERE` clause.
- `user-authentication` already provides a reusable `JwtAuthGuard`, the
  `@CurrentUser('userId')` decorator, and the stateless 1-hour bearer JWT. Its
  task 11 explicitly deferred guarding financial endpoints to "later feature
  specs that add financial endpoints" — **this is that spec.**

This spec turns those building blocks into a REST surface for transactions. It
does **not** change the data model, the service's scoping logic, or auth.

## Terminology
- **User**: the authenticated login identity (resolved from the JWT as
  `userId`), per `user-authentication`. Not a financial account.
- **Transaction**: a single recorded income or expense owned by one user, per
  `data-model-and-persistence`.
- **Caller / current user**: the user identified by the bearer token on the
  request.
- **Owns**: a transaction is owned by the caller when its `userId` equals the
  caller's `userId`.

## Scope
In scope:
- Authenticated REST endpoints for transactions under a transactions resource
  path, covering the four operations:
  - **GET** (list the caller's transactions, with optional filtering; and get a
    single transaction by id).
  - **POST** (create a transaction for the caller).
  - **PUT** (update a transaction the caller owns).
  - **DELETE** (permanently delete a transaction the caller owns).
- Protecting every endpoint with the existing `JwtAuthGuard` and resolving the
  owner via `@CurrentUser('userId')`.
- Server-side validation and sanitization of request bodies and query params
  (amount, type, currency, date, description, filters).
- Consistent, non-disclosing error responses and correct HTTP status codes.
- Per-user isolation at the HTTP boundary: a caller can only read or mutate
  their own transactions.

Out of scope:
- The data model, migrations, or the `TransactionsService` scoping logic
  (owned by `data-model-and-persistence`).
- Authentication, token issuance, or session handling
  (owned by `user-authentication`).
- Natural-language transaction capture / parsing (future
  `natural-language-transaction-capture`); this API takes already-structured
  fields.
- Automatic categorization, Q&A, summaries, trends, insights (later specs).
- Multi-currency conversion / FX (explicitly not modeled per
  `data-model-and-persistence`).
- Pagination and sorting controls beyond the service's existing default
  ordering, unless a later spec requires them.
- Any frontend/UI work; this spec defines the backend API only.
- **Moving real money** or connecting to financial institutions (product
  non-goal): this API only records and manages user-entered data.

## Backend contract this API relies on (consumed, not defined here)
- `TransactionsService` methods are already user-scoped and are the only way
  this API reads or mutates data; the HTTP layer MUST pass the caller's
  `userId` to every call and MUST NOT bypass the service with unscoped queries.
- A transaction's fields are: `id` (uuid), `userId` (uuid, owner), `amount`
  (precise decimal, represented as a **string** — never a float), `type`
  (`income` | `expense`), `currency` (`COP` | `USD`), `date` (`YYYY-MM-DD`
  calendar day), `description` (optional text or null), `createdAt`,
  `updatedAt`.
- `JwtAuthGuard` rejects requests without a valid, non-expired bearer token
  with `401`; `@CurrentUser('userId')` yields the caller's id.

## Requirements

### Requirement 1 — Authentication required on every endpoint
**User story:** As a user, I want my transaction endpoints to be private, so
that only I can access my financial data.

Acceptance criteria (EARS):
1. THE SYSTEM SHALL protect every transaction endpoint (GET, POST, PUT, DELETE)
   with the existing `JwtAuthGuard`.
2. WHEN a request carries a valid, non-expired bearer token, THE SYSTEM SHALL
   resolve the caller's `userId` via `@CurrentUser('userId')` and scope the
   operation to that user.
3. IF a request has no token, or an invalid/expired token, THEN THE SYSTEM SHALL
   deny access with `401 Unauthorized` and SHALL NOT perform the operation.
4. THE SYSTEM SHALL NOT accept a user identifier from the request body, query,
   or path to determine ownership; ownership SHALL be derived solely from the
   authenticated token.

### Requirement 2 — Create a transaction (POST)
**User story:** As a user, I want to record a transaction, so that it is saved
under my account.

Acceptance criteria (EARS):
1. WHEN the caller POSTs a valid transaction body, THE SYSTEM SHALL create a
   transaction owned by the caller and respond `201 Created` with the created
   transaction (including its generated `id` and timestamps).
2. THE create body SHALL require `amount`, `type`, `currency`, and `date`, and
   SHALL accept an optional `description`.
3. THE SYSTEM SHALL validate that `type` is one of `income` | `expense` and
   `currency` is one of `COP` | `USD`; IF either is outside its closed set,
   THEN THE SYSTEM SHALL reject the request with `400 Bad Request`.
4. THE SYSTEM SHALL validate that `amount` is a well-formed positive decimal
   value represented as a string (preserving precision, never parsed as a
   float), and that `date` is a valid calendar day in `YYYY-MM-DD` form; IF not,
   THEN THE SYSTEM SHALL reject the request with `400 Bad Request`.
5. IF the body contains unknown/extra fields or is missing a required field,
   THEN THE SYSTEM SHALL reject the request with `400 Bad Request` (via the
   global validation), and SHALL NOT create a partial record.
6. THE SYSTEM SHALL NOT allow the client to set `id`, `userId`, `createdAt`, or
   `updatedAt`; these are server-assigned.

### Requirement 3 — List the caller's transactions (GET collection)
**User story:** As a user, I want to list my transactions, so that I can review
what I have recorded.

Acceptance criteria (EARS):
1. WHEN the caller GETs the transactions collection, THE SYSTEM SHALL return
   only transactions owned by the caller, ordered newest day first (consistent
   with the service's default ordering), with `200 OK`.
2. WHERE a `type` query filter is supplied, THE SYSTEM SHALL return only the
   caller's transactions of that type; IF `type` is not `income` | `expense`,
   THEN THE SYSTEM SHALL reject the request with `400 Bad Request`.
3. WHERE `dateFrom` and/or `dateTo` query filters are supplied (inclusive,
   `YYYY-MM-DD`), THE SYSTEM SHALL return only the caller's transactions within
   that range, AND-ed with any `type` filter; IF a date filter is malformed,
   THEN THE SYSTEM SHALL reject the request with `400 Bad Request`.
4. WHEN the caller has no matching transactions, THE SYSTEM SHALL return an
   empty list with `200 OK` (not an error).

### Requirement 4 — Read a single transaction (GET item)
**User story:** As a user, I want to fetch one transaction by id, so that I can
see its details.

Acceptance criteria (EARS):
1. WHEN the caller GETs a transaction by id that they own, THE SYSTEM SHALL
   respond `200 OK` with that transaction.
2. IF the id does not correspond to a transaction owned by the caller (whether
   it does not exist OR belongs to another user), THEN THE SYSTEM SHALL respond
   `404 Not Found` and SHALL NOT disclose whether the id exists for a different
   user.
3. IF the id path segment is not a syntactically valid identifier (uuid), THEN
   THE SYSTEM SHALL reject the request with `400 Bad Request`.

### Requirement 5 — Update a transaction (PUT)
**User story:** As a user, I want to edit a transaction I recorded, so that I
can correct its details.

Acceptance criteria (EARS):
1. WHEN the caller PUTs a valid update to a transaction they own, THE SYSTEM
   SHALL apply the changes and respond `200 OK` with the updated transaction.
2. THE SYSTEM SHALL apply the same field validation as create for any provided
   field (`amount` positive decimal string, `type` in `income` | `expense`,
   `currency` in `COP` | `USD`, `date` valid `YYYY-MM-DD`, `description`
   optional text or null); IF any provided field is invalid, THEN THE SYSTEM
   SHALL reject the request with `400 Bad Request` and SHALL NOT partially
   apply the update.
3. IF the target transaction is not owned by the caller (does not exist OR
   belongs to another user), THEN THE SYSTEM SHALL respond `404 Not Found` and
   SHALL NOT modify any data.
4. THE SYSTEM SHALL NOT allow `id`, `userId`, `createdAt`, or `updatedAt` to be
   changed by the request.

### Requirement 6 — Delete a transaction (DELETE)
**User story:** As a user, I want to delete a transaction I recorded, so that it
no longer appears in my data.

Acceptance criteria (EARS):
1. WHEN the caller DELETEs a transaction they own, THE SYSTEM SHALL permanently
   remove it (physical delete, consistent with the data model) and respond with
   a success status that carries no body (`204 No Content`).
2. IF the target transaction is not owned by the caller (does not exist OR
   belongs to another user), THEN THE SYSTEM SHALL respond `404 Not Found` and
   SHALL NOT delete any data.
3. AFTER a successful delete, THE SYSTEM SHALL cause subsequent GETs of that id
   by the caller to return `404 Not Found`.

### Requirement 7 — Per-user isolation at the HTTP boundary
**User story:** As a user, I want certainty that no one else can reach my
transactions through the API, so that my financial data stays private.

Acceptance criteria (EARS):
1. THE SYSTEM SHALL scope every read and write to the caller's `userId`, routed
   exclusively through the user-scoped `TransactionsService`.
2. THE SYSTEM SHALL NOT return, update, or delete any transaction owned by a
   different user, regardless of a valid id being supplied (ties to
   `data-model-and-persistence` Requirement 3 and `user-authentication`
   Requirement 4).
3. WHEN a caller references another user's transaction id, THE SYSTEM SHALL
   behave identically to referencing a non-existent id (`404 Not Found`), so the
   existence of other users' data is never disclosed.

### Requirement 8 — Validation, errors, and security baseline
**User story:** As any client, I want predictable, safe error behavior, so that
I can integrate reliably without leaking sensitive details.

Acceptance criteria (EARS):
1. THE SYSTEM SHALL validate and sanitize all request bodies and query
   parameters using the backend's global validation, rejecting malformed input
   with `400 Bad Request`.
2. THE SYSTEM SHALL preserve monetary precision end to end by treating `amount`
   as a decimal string and never converting it to a floating-point number.
3. THE SYSTEM SHALL NOT include stack traces, SQL, connection strings, tokens,
   or other internal details in error responses.
4. THE SYSTEM SHALL use parameterized access via TypeORM/`TransactionsService`
   (no string-interpolated queries), consistent with the security baseline.
5. THE SYSTEM SHALL treat all transaction data as sensitive PII and SHALL NOT
   log full row contents, credentials, or tokens.

### Requirement 9 — Stack and quality
**User story:** As a developer, I want the API to align with the project's
stack and pass its checks.

Acceptance criteria (EARS):
1. THE implementation SHALL align with `.kiro/steering/tech.md` (NestJS backend,
   TypeORM, ESM with `.js` import specifiers) and live under the existing
   `backend/src/transactions/` feature module.
2. THE implementation SHALL pass `pnpm --dir backend lint`,
   `pnpm --dir backend format:check`, `pnpm --dir backend build`, and
   `pnpm --dir backend test`.
3. THE SYSTEM SHALL include automated tests covering: auth required (`401`
   without a valid token), create/read/update/delete happy paths, validation
   rejections (`400`), and per-user isolation (`404` for another user's id).

## Open questions / decisions for design
These are flagged for the Tech Lead / Solution Architect to resolve in
`design.md`; the requirements above are intentionally agnostic to them:
- **Resource path and item identifier**: the exact route base (e.g.
  `/transactions`) and whether the id is validated with a uuid pipe at the
  param level.
- **Create response `Location` header**: whether `201` also sets a `Location`
  header to the new resource (REST nicety, not mandated above).
- **PUT semantics**: this spec specifies PUT applying validated changes and
  returning the updated resource. Whether PUT is treated as a full replace vs
  the existing service's partial `update` (which ignores undefined fields) is a
  design decision; Requirement 5 only mandates validated, all-or-nothing
  application and `404` on non-ownership. If a distinct PATCH is ever desired,
  that is a later addition.
- **DTO mechanism**: the current `backend/src/transactions/dto/*` are plain
  TypeScript interfaces; adding HTTP validation implies `class-validator`/
  `class-transformer` DTO classes (already dependencies via
  `user-authentication`). The exact DTO shape and reuse is a design concern.
- **Serialization**: confirming the response shape returns `amount` as a string
  and excludes nothing sensitive (the entity has no secret fields, but the
  design should state the response contract explicitly).

## Status
- Requirements: drafted, ready for review.
- Design (`design.md`): not started — pending Tech Lead (architecture) informed
  by the Solution Architect.
- Tasks (`tasks.md`): not started — pending design.

Depends on: `data-model-and-persistence` (implemented — provides the
user-scoped `TransactionsService` and the `transaction` table),
`user-authentication` (implemented — provides `JwtAuthGuard` and
`@CurrentUser`).
