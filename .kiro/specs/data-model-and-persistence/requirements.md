# Requirements — Data Model and Persistence

## Overview
Define Finlux's core data model and the backend persistence layer in PostgreSQL:
users, accounts, transactions, and categories. This is foundational for every
later feature (natural-language capture, categorization, Q&A, summaries).

## Terminology
- **User**: a login identity / person who uses Finlux. Scopes all financial data.
- **Account**: a user-named financial account or wallet (e.g. "cash", "payroll"),
  belonging to one User. Not a login account.

## Scope
In scope:
- Entities and relationships for users, accounts, transactions, categories.
- Persistence layer in the NestJS backend (schema, migrations, repositories).
- Data integrity, validation, and per-user isolation at the data layer.

Out of scope:
- Authentication/session logic (see `user-authentication`).
- Natural-language parsing (see `natural-language-transaction-capture`).
- Any UI.

## Requirements

### Requirement 1 — Core entities
**User story:** As the system, I need a well-defined data model so that financial
data is stored consistently and can be reasoned over.

Acceptance criteria (EARS):
1. THE SYSTEM SHALL persist a `User` entity uniquely identified and used to scope
   all financial data.
2. THE SYSTEM SHALL persist an `Account` entity (user-named, e.g. "cash",
   "payroll"), each belonging to exactly one user.
3. THE SYSTEM SHALL persist a `Transaction` entity with at least: amount,
   currency, type (income/expense), date, description, an owning user, an
   associated account, and an optional category.
4. THE SYSTEM SHALL persist a `Category` entity used to classify transactions.

### Requirement 2 — Relationships and integrity
Acceptance criteria (EARS):
1. THE SYSTEM SHALL enforce that every account and transaction belongs to a user.
2. THE SYSTEM SHALL enforce referential integrity between transactions and their
   account and category.
3. WHEN a monetary amount is stored, THE SYSTEM SHALL use a precise decimal
   representation (no floating-point rounding of money).
4. THE SYSTEM SHALL record creation and update timestamps for auditable records.

### Requirement 3 — Per-user isolation
Acceptance criteria (EARS):
1. THE SYSTEM SHALL scope all queries for accounts, transactions, and categories
   to the owning user.
2. THE SYSTEM SHALL NOT allow data of one user to be returned in the context of
   another user.

### Requirement 4 — Persistence and migrations
Acceptance criteria (EARS):
1. THE SYSTEM SHALL manage schema changes through versioned migrations.
2. THE SYSTEM SHALL use parameterized queries / an ORM to prevent SQL injection.
3. THE SYSTEM SHALL target PostgreSQL 18.6 as pinned in `.kiro/steering/tech.md`.

### Requirement 5 — Security baseline
Acceptance criteria (EARS):
1. THE SYSTEM SHALL treat all stored financial data as sensitive PII.
2. THE SYSTEM SHALL read database connection config from the environment
   (never hard-coded), referenced by key name only.
