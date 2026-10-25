# syntax=docker/dockerfile:1

# =============================================================================
# Finlux frontend (Next.js 16, App Router) — multi-stage image.
#
# Stages:
#   base    pinned Node + pnpm (via corepack), shared by every later stage
#   deps    full install (incl. dev deps) for building, cached by lockfile
#   build   runs `next build` with `output: "standalone"`
#   runner  minimal runtime: only the standalone server + static assets
#
# Uses Next.js Output File Tracing (`output: "standalone"` in next.config.ts),
# so the runtime stage ships a self-contained `server.js` and the minimal set
# of node_modules — no `pnpm install` at runtime.
#
# BuildKit cache mounts speed up the pnpm store and the Next.js build cache
# without baking either into an image layer. Requires BuildKit.
# =============================================================================

# --- Pinned toolchain (see .kiro/steering/tech.md) ---------------------------
FROM node:24.22.1-bookworm-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@12.15.0 --activate
WORKDIR /app

# --- Dependencies ------------------------------------------------------------
# Copy only the manifests first so installs are cached while source changes.
# The pnpm store lives in a cache mount, shared across builds.
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile

# --- Build -------------------------------------------------------------------
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# NEXT_PUBLIC_* vars are inlined into the client bundle at build time, so the
# API base URL must be supplied as a build arg (not just at runtime).
ARG NEXT_PUBLIC_API_BASE_URL
ENV NEXT_PUBLIC_API_BASE_URL=${NEXT_PUBLIC_API_BASE_URL}

ENV NEXT_TELEMETRY_DISABLED=1
# Cache mount on the Next.js build cache for fast incremental rebuilds.
RUN --mount=type=cache,id=next-cache,target=/app/.next/cache \
    pnpm run build

# --- Runtime -----------------------------------------------------------------
FROM node:24.22.1-bookworm-slim AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app

# Serve on all interfaces so the container is reachable; Railway injects PORT.
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

# Run as the unprivileged `node` user that ships with the base image.
# Static assets and the standalone server, with correct ownership.
COPY --from=build --chown=node:node /app/public ./public
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static

USER node

EXPOSE 3000

# `server.js` is emitted by Next.js standalone output at the project root.
CMD ["node", "server.js"]
