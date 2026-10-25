# Technology — Finlux

> This file records the intended technical stack and conventions. It is a living
> document: update it as concrete decisions are made and dependencies are added.

## Repository layout
Monorepo with two applications:
- `backend/` — API and agent services (Node.js).
- `frontend/` — web client (Node.js build toolchain, outputs to `frontend/build`).

The `.gitignore` already assumes:
- Node.js in both apps (`node_modules`).
- Build outputs: `backend/dist`, `frontend/build`.
- Environment files: `backend/.env`, `frontend/.env`.

## Pinned toolchain
These versions are fixed for the whole monorepo. Pin them in `package.json`
(`engines`, `packageManager`) and in any CI / container images.

| Tool | Version | Scope |
|------|---------|-------|
| Node.js | 24.22.1 (LTS) | backend + frontend |
| pnpm | 12.15.0 | package manager (both apps) |
| TypeScript | latest stable compatible with the frameworks below | backend + frontend |

Use `pnpm` for every install/run/build task. Do not mix in `npm` or `yarn`
(NestJS's CLI defaults to npm/yarn — override to pnpm when scaffolding).

## Stack
- **Language**: TypeScript across backend and frontend.
- **Backend**: [NestJS](https://nestjs.com/) on Node.js 24.22.1.
  Scaffolded with `@nestjs/cli` **12.0.10** (latest published; a `12.1.x`
  does not exist). Runtime packages `@nestjs/*` resolve to the **12.x** line
  (`@nestjs/core` **12.2.0** at scaffold time).
- **Database**: PostgreSQL **18.6**.
- **ORM / persistence**: **[TypeORM](https://typeorm.io/)** in the NestJS
  backend, targeting PostgreSQL 18.6. Schema changes are managed through
  versioned migrations (no auto-`synchronize` in non-dev environments).
- **Frontend**: [Next.js](https://nextjs.org/) **16.4.3** on Node.js 24.22.1.
- **AI / agent layer**:
  - **LLM provider**: **Google** (Gemini models), accessed via the
    `@ai-sdk/google` provider.
  - **Orchestration**: **[Mastra](https://mastra.ai/)** (v1+), the TypeScript
    AI agent framework, used as a direct SDK in the backend. Mastra routes
    models through the Vercel AI SDK, so Google Gemini is a first-class provider.
  - Agents, tools, and workflows live in the backend and reason over the user's
    financial data. The agent must never move real money (see product non-goals).
  - **Config**: the Google API key is provided via `backend/.env`
    (e.g. `GOOGLE_GENERATIVE_AI_API_KEY`) and documented in `backend/.env.example`.
    Reference it by key name, never commit the value.

> All core stack decisions are now settled. The specific Gemini model(s) and any
> Mastra storage/memory backend will be chosen per-feature during spec/design.

## Environment & configuration
- Secrets and config live in `backend/.env` and `frontend/.env` (git-ignored).
- Never commit secrets. Reference them by key name, never by value.
- Provide `.env.example` files (committed) documenting required keys.

## Build & run conventions
- Prefer scripts defined in each app's `package.json`
  (e.g. `dev`, `build`, `test`, `lint`) over ad-hoc commands.
- Verify changes by running the relevant app's build and tests before
  declaring work complete.

## Security baseline (finance app)
- Treat all financial data as highly sensitive PII.
- Validate and sanitize all input; use parameterized queries.
- The agent must not perform real-money movements (see product non-goals).
- Pin dependency versions; avoid unmaintained or typosquatted packages.
