# Project Structure — Finlux

## Top-level layout
```
finlux/
├── .kiro/              # Kiro "office": steering, specs, hooks, settings
│   ├── steering/       # Persistent context & rules (this folder)
│   ├── specs/          # Feature specs (requirements → design → tasks)
│   ├── hooks/          # Event-driven automations
│   └── settings/       # Configuration (e.g. mcp.json)
├── backend/            # API + agent services (Node.js / TypeScript)
├── frontend/           # Web client (Node.js / TypeScript)
├── README.md
├── LICENSE
└── .gitignore
```

## Conventions
- **Monorepo**: `backend/` and `frontend/` are independent apps, each with its
  own `package.json`, dependencies, and build output.
- **Build outputs**: `backend/dist`, `frontend/build` (both git-ignored).
- **Env files**: `backend/.env`, `frontend/.env` (git-ignored). Commit
  `*.env.example` instead.

## Where things go
- New backend feature code → under `backend/` following its internal structure
  (to be established when the backend is scaffolded).
- New frontend feature code → under `frontend/`.
- Cross-cutting decisions, rules, and context → `.kiro/steering/`.
- A new feature's requirements/design/tasks → `.kiro/specs/<feature-name>/`.

## Naming
- Directories and files: `kebab-case`.
- Spec folders: `kebab-case` describing the feature
  (e.g. `transaction-categorization`).

> As the backend and frontend are scaffolded, extend this document with their
> concrete internal folder structures so the layout stays discoverable.

## Backend internal structure (`backend/`)
Scaffolded with the NestJS CLI (ESM, `"type": "module"`). Tooling: **ESLint**
(flat config, `typescript-eslint`) for linting, **Prettier** for formatting
(integrated via `eslint-plugin-prettier` / `eslint-config-prettier`), and
**Vitest** for unit and e2e tests. Scripts: `lint`, `lint:fix`, `format`,
`format:check`.
```
backend/
├── src/
│   ├── main.ts               # App bootstrap
│   ├── app.module.ts         # Root module
│   ├── app.controller.ts
│   ├── app.controller.spec.ts
│   └── app.service.ts
├── test/
│   └── app.e2e-spec.ts       # End-to-end tests
├── nest-cli.json
├── tsconfig.json / tsconfig.build.json
├── vitest.config.ts / vitest.config.e2e.ts
├── .oxlintrc.json / .prettierrc
├── .env.example              # Documents required env keys (copy to .env)
└── package.json              # name: @finlux/backend
```
Feature modules (e.g. accounts, transactions, the AI agent) will be added under
`src/` as NestJS modules as features are built.

## Frontend internal structure (`frontend/`)
Scaffolded with `create-next-app` (App Router, `src/` dir, TypeScript,
Tailwind CSS v4, ESLint). **Prettier** is integrated via `eslint-config-prettier`
(plus `prettier-plugin-tailwindcss` to order Tailwind classes). Scripts: `lint`,
`lint:fix`, `format`, `format:check`. Cache Components and Partial Prefetching
are enabled in `next.config.ts`.
```
frontend/
├── src/
│   └── app/                  # Next.js App Router
│       ├── layout.tsx
│       ├── page.tsx
│       ├── globals.css
│       └── favicon.ico
├── public/                   # Static assets
├── next.config.ts
├── tsconfig.json
├── eslint.config.mjs
├── pnpm-workspace.yaml       # pnpm allowBuilds policy (sharp, unrs-resolver)
├── AGENTS.md                 # create-next-app agent notes
└── package.json              # name: @finlux/frontend
```
Build output goes to `.next/` (git-ignored). Routes, components, and API calls
to the backend will be added under `src/app/` as the UI is built.
