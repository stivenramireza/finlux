# syntax=docker/dockerfile:1

# =============================================================================
# Finlux backend (NestJS) — multi-stage image.
#
# Stages:
#   base    pinned Node + pnpm (via corepack), shared by every later stage
#   deps    full install (incl. dev deps) for building, cached by lockfile
#   build   compiles TypeScript -> dist/
#   prod-deps  production-only node_modules, cached by lockfile
#   runner  minimal runtime: dist/ + prod node_modules, runs as non-root
#
# A BuildKit cache mount on the pnpm store makes repeat builds fast without
# baking the store into any layer. Requires BuildKit (default in modern Docker).
# =============================================================================

# --- Pinned toolchain (see .kiro/steering/tech.md) ---------------------------
FROM node:24.22.1-bookworm-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
# Pin pnpm to the version declared in package.json's `packageManager`.
RUN corepack enable && corepack prepare pnpm@12.15.0 --activate
WORKDIR /app

# --- Full dependencies (build) -----------------------------------------------
# Copy only the manifests first so this layer is reused whenever source code
# changes but dependencies do not. The pnpm store is a cache mount, so the
# downloaded packages are shared across builds and never committed to a layer.
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile

# --- Build -------------------------------------------------------------------
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# `nest build` compiles to ./dist (entry: dist/main.js).
RUN pnpm run build

# --- Production dependencies -------------------------------------------------
# Resolve a lean, production-only node_modules. `bcrypt` is a native module and
# is allowlisted for build in pnpm-workspace.yaml, so its native addon compiles
# here against the same Node version used at runtime.
FROM base AS prod-deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --prod

# --- Runtime -----------------------------------------------------------------
FROM node:24.22.1-bookworm-slim AS runner
ENV NODE_ENV=production
WORKDIR /app

# Run as the unprivileged `node` user that ships with the base image.
COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
# package.json is needed at runtime: `"type": "module"` governs ESM resolution,
# and migration scripts reference it.
COPY --chown=node:node package.json ./

USER node

# Nest listens on PORT (defaults to 3000 in main.ts). Railway injects PORT at
# runtime; EXPOSE is documentation only.
EXPOSE 3000

# Entry compiled from src/main.ts.
CMD ["node", "dist/main.js"]
