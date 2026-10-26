---
name: run-dev-stack
description: Start the Finlux local development stack — the NestJS backend and the Next.js frontend — together, with the correct ports, env files, and CORS. Use when asked to run, serve, boot, or launch the app locally (backend + frontend) for manual testing.
metadata:
  backend: "@finlux/backend (NestJS, port 8000)"
  frontend: "@finlux/frontend (Next.js 16, port 3000)"
---

# Run the Finlux dev stack (backend + frontend)

Starts both apps as long-running background processes for manual validation.
Both use **pnpm** (pinned; never npm/yarn).

## Ports & wiring (must match)
- **Backend (NestJS):** port **8000** (from `PORT` in `backend/.env`).
  CORS allowlist (`CORS_ORIGIN`) must include the frontend origin; default is
  `http://localhost:3000`.
- **Frontend (Next.js):** port **3000**. Reads
  `NEXT_PUBLIC_API_BASE_URL` → must point at the backend: `http://localhost:8000`.

The backend and frontend ports are intentionally different, and the frontend's
API base URL must land inside the backend's CORS allowlist, or browser calls
fail.

## Preconditions
1. **Dependencies installed** in both apps (`backend/node_modules`,
   `frontend/node_modules`). If missing, run `pnpm install` in each.
2. **Env files present** (both git-ignored; create if missing):
   - `backend/.env` — needs at least `DATABASE_URL`, `PORT=8000`,
     `CORS_ORIGIN=http://localhost:3000`, `JWT_SECRET`. See `backend/.env.example`.
   - `frontend/.env` — `NEXT_PUBLIC_API_BASE_URL=http://localhost:8000`.
     Without it, the frontend's config accessor throws on load.
   - Writing `.env` files may be blocked by a permission rule; if so, create
     them from the terminal (e.g. `printf '...' > frontend/.env`). Reference
     secrets by key name; never echo or commit values.
3. **PostgreSQL running** — a Docker container named `postgres` exposing 5432,
   with the `finlux` database created. Check: `docker ps`.

## Start the stack

Run both apps directly with `pnpm run start` — **no build step is needed**.
The backend's `start` (`nest start`) compiles on the fly, and the frontend's
`start` (`next start -p 3000`) is pinned to port 3000. Both bind to their fixed
ports (backend 8000 from `PORT` in `backend/.env`, frontend 3000), so there's no
need for the `--port` flag or the `next dev` workaround.

### Backend
From `backend/`, run in the background and capture logs:

```bash
pnpm run start > /tmp/finlux-backend.log 2>&1   # run_in_background
```

Wait a few seconds, then confirm it booted (look for
"Nest application successfully started" and the mapped routes):

```bash
tail -n 40 /tmp/finlux-backend.log
```

### Frontend
From `frontend/`, run in the background and capture logs:

```bash
pnpm run start > /tmp/finlux-frontend.log 2>&1   # run_in_background
```

Wait a few seconds, then confirm (look for
`Local: http://localhost:3000`):

```bash
tail -n 30 /tmp/finlux-frontend.log
```

## Verify both respond

```bash
curl -s -o /dev/null -w "backend  / : HTTP %{http_code}\n" http://localhost:8000/
curl -s -o /dev/null -w "frontend / : HTTP %{http_code}\n" http://localhost:3000/
# backend validation sanity check (empty body should be 400):
curl -s -o /dev/null -w "login    : HTTP %{http_code}\n" \
  -X POST http://localhost:8000/auth/login -H 'Content-Type: application/json' -d '{}'
```

Expected: backend `/` → 200, frontend `/` → 200, login with empty body → 400.

## Notes
- Leave both processes running for the user's manual validations; report the
  URLs and log paths.
- Logs: `/tmp/finlux-backend.log`, `/tmp/finlux-frontend.log`
  (`tail -f` to follow).
- Both apps run with `pnpm run start` on their fixed ports (backend 8000,
  frontend 3000); no build step is required.
- To stop them later, kill the background processes the session started.
