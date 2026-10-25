# Requirements — User Authentication

## Overview
Provide user registration, login, session management, and per-user data
isolation so that each user's financial data is private and secure.

## Terminology
- **User**: a login identity (the person authenticating). "Register/create an
  account" here means creating a **User**, not a financial Account.
- **Account** (financial) is defined in `data-model-and-persistence` and is out
  of scope for this spec.

## Scope
In scope:
- Registration, login, logout, and authenticated sessions.
- Securely storing credentials and identifying the current user on requests.
- Enforcing that financial data is only accessible to its owner.

Out of scope:
- The data model itself (see `data-model-and-persistence`).
- Social/third-party login (may be a later spec).
- Any conversational/agent behavior.

## Requirements

### Requirement 1 — Registration
**User story:** As a new user, I want to create an account so that I can use
Finlux privately.

Acceptance criteria (EARS):
1. WHEN a user registers with valid credentials, THE SYSTEM SHALL create a user
   record and confirm success.
2. IF the identifier (e.g. email) is already registered, THEN THE SYSTEM SHALL
   reject the registration with a clear error.
3. THE SYSTEM SHALL validate and sanitize all registration input.

### Requirement 2 — Credential security
Acceptance criteria (EARS):
1. THE SYSTEM SHALL store passwords only as salted, hashed values using a
   well-established algorithm; it SHALL NOT store plaintext passwords.
2. THE SYSTEM SHALL NOT log or echo credentials or secrets.

### Requirement 3 — Login and session
**User story:** As a registered user, I want to log in so that I can access my
own finances.

Acceptance criteria (EARS):
1. WHEN a user submits valid credentials, THE SYSTEM SHALL establish an
   authenticated session and return/set a session token.
2. IF credentials are invalid, THEN THE SYSTEM SHALL reject the attempt with a
   generic error (no disclosure of which field was wrong).
3. WHEN a user logs out, THE SYSTEM SHALL invalidate the session.

### Requirement 4 — Authorization and isolation
Acceptance criteria (EARS):
1. THE SYSTEM SHALL require a valid session for every endpoint that reads or
   writes financial data.
2. THE SYSTEM SHALL resolve the current user from the session and scope all data
   access to that user (ties to `data-model-and-persistence` Requirement 3).
3. WHEN a request has no valid session, THE SYSTEM SHALL deny access to protected
   resources.

### Requirement 5 — Configuration and baseline
Acceptance criteria (EARS):
1. THE SYSTEM SHALL read auth secrets (e.g. token signing keys) from the
   environment, referenced by key name, and SHALL NOT commit them.
2. THE SYSTEM SHALL align with the stack in `.kiro/steering/tech.md`
   (NestJS backend, PostgreSQL) and the security baseline.
