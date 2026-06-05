# Testing Guide

## Port Scheme

All port numbers follow a `14XYY` pattern where X is the environment and YY is the service.

| Service | DEV (146xx) | Test (147xx) | E2E (148xx) |
|---------|-------------|--------------|-------------|
| PostgreSQL | 14600 | 14700 | 14800 |
| Redis | 14601 | 14701 | 14801 |
| MinIO (API) | 14602 | 14702 | 14802 |
| MinIO (Console) | 14603 | 14703 | 14803 |
| Mailpit (SMTP) | 14604 | 14704 | 14804 |
| Mailpit (UI) | 14605 | 14705 | 14805 |
| Web (Next.js) | 14606 | — | 14806 |
| Backend (NestJS) | 14607 | 14707 | 14807 |
| Mock DOM | 14608 | — | 14808 |
| Mock LLM | 14609 | — | 14809 |
| Mock Stripe | 14610 | 14710 | 14810 |
| Mock Clerk | 14611 | 14711 | 14811 |

## Test Types

| Type | Location | Infrastructure | Command |
|------|----------|----------------|---------|
| Unit (Backend) | `backend-ts/test/unit/` | None | `pnpm test` (in backend-ts) |
| Integration | `backend-ts/test/integration/` | Test infra (147xx) | `pnpm test:int` |
| HTTP | `backend-ts/test/http/` | Test infra (147xx) | `pnpm run test:http` (in backend-ts) |
| E2E | `e2e/tests/` | E2E infra (148xx) | `pnpm e2e` |

## Prerequisites

- Docker Desktop running
- `pnpm` installed (project uses pnpm workspaces)
- Node.js 20+ (verified working with Node 25)
- From repo root: `pnpm install`

**Note:** `pg_isready` and `redis-cli` are not on the macOS PATH by default. Use `docker exec` to run them:
```bash
docker exec <container_name> pg_isready -p <port> -U <user>
docker exec <container_name> redis-cli -p <port> ping
```

## DEV Environment Setup

```bash
cd /path/to/find-with

# Stop any running environments first
docker compose -f docker-compose.dev.yml down -v
docker compose -f docker-compose.test.yml down -v
docker compose -f docker-compose.e2e.yml down -v

# Start dev infrastructure
docker compose -f docker-compose.dev.yml up -d --build

# Wait ~15 seconds, then verify
docker exec find-with-postgres-1 pg_isready -p 14600 -U findwith
docker exec find-with-redis-1 redis-cli -p 14601 ping
curl -sf http://localhost:14602/minio/health/live
curl -sf http://localhost:14611/health   # mock-clerk
curl -sf http://localhost:14610/health   # mock-stripe

# Build backend
cd backend-ts
pnpm install
pnpm run build

# Run dev migrations
pnpm run migration:run
# (reads DATABASE_URL from backend-ts/.env which points to 14600)
```

## Unit Tests (Backend)

No infrastructure required. Run from `backend-ts/`:

```bash
cd backend-ts
pnpm test
```

Expected: 215 tests pass.

## Integration Tests

Requires test infrastructure (147xx ports):

```bash
# From repo root — starts infra, runs migrations, runs tests in one command
pnpm test:int

# Or manually:
docker compose -f docker-compose.test.yml up -d --build
# wait ~15s
cd backend-ts
pnpm run test:int:migrate   # runs migrations via .env.test → port 14700
pnpm run test:int           # 52 tests
pnpm run test:http          # 110 tests
```

`pnpm test:int` from root is the canonical single-command path. It calls:
1. `docker compose -f docker-compose.test.yml up -d --wait`
2. `pnpm --filter backend-ts run test:int:migrate`
3. `pnpm --filter backend-ts run test:int`

## HTTP Tests

Same infrastructure as integration tests:

```bash
# From backend-ts/
pnpm run test:http
```

Expected: 110 tests pass.

## E2E Tests

### Critical Warning: Volume Conflict

The dev compose (`docker-compose.dev.yml`) and e2e compose (`docker-compose.e2e.yml`) both use the service name `postgres`, which creates a container named `find-with-postgres-1`. The dev compose creates a named volume `pgdata` with the `findwith` user. If e2e compose starts while dev compose has been running (even after `down -v`), the container may be recreated using the stale volume if it wasn't fully removed.

**Always do a full teardown before starting e2e:**

```bash
docker compose -f docker-compose.dev.yml down -v
docker compose -f docker-compose.e2e.yml down -v
```

Then start e2e fresh:

```bash
docker compose -f docker-compose.e2e.yml up -d
```

Verify the `e2e` user exists (not `findwith`):

```bash
docker exec find-with-postgres-1 psql -U e2e -d findwith_e2e -c "\du"
```

If you see `findwith` user instead of `e2e`, the volume conflict occurred. Run `down -v` again and retry.

### Full E2E Run

```bash
# Step 1: Tear down everything
docker compose -f docker-compose.dev.yml down -v
docker compose -f docker-compose.e2e.yml down -v

# Step 2: Start E2E infrastructure
docker compose -f docker-compose.e2e.yml up -d
# Wait ~20 seconds

# Step 3: Verify services
curl -sf http://localhost:14808/health   # mock-dom
curl -sf http://localhost:14809/health   # mock-llm
curl -sf http://localhost:14810/health   # mock-stripe
curl -sf http://localhost:14811/health   # mock-clerk
curl -sf http://localhost:14802/minio/health/live
docker exec find-with-postgres-1 pg_isready -p 14800 -U e2e -d findwith_e2e
docker exec find-with-redis-1 redis-cli -p 14801 ping

# Step 4: Build backend (must be done before running tests)
cd backend-ts
pnpm run build

# Step 5: Build extension for E2E
cd ..
bash e2e/scripts/build-extension-e2e.sh

# Verify config chunk has port 14807
cat extension/dist-e2e/chunks/config-*.js
# Expected: const t="http://localhost:14807"

# Step 6: Run E2E tests (global-setup handles migrations, seeding, and backend start)
NODE_OPTIONS=--no-strip-types pnpm exec playwright test
# Or: pnpm e2e
```

Expected: 8 tests pass.

### What global-setup Does Automatically

`e2e/global-setup.ts` handles:
1. Verifies docker services are healthy
2. Creates MinIO bucket (`findwith-test`)
3. Reads `backend-ts/.env.e2e` via `parseEnvFile()` and runs TypeORM migrations
4. Seeds fixture data via `e2e/fixtures/seed.ts`
5. Starts the NestJS backend on port 14807
6. Waits for `http://localhost:14807/ready`

`e2e/global-teardown.ts` kills the backend process on completion.

### NODE_OPTIONS Note

Node 25 does not allow `--env-file=` in `NODE_OPTIONS`. The `parseEnvFile()` helper in `global-setup.ts` manually reads `.env.e2e` and passes the vars via `env: { ...process.env, ...envVars }` to child processes. This is how migrations and seeding pick up the e2e database URL (`postgresql://e2e:e2e@localhost:14800/findwith_e2e`).

Do not use `NODE_OPTIONS='--env-file=.env.e2e'` — it will fail on Node 25.

### E2E Cleanup

```bash
docker compose -f docker-compose.e2e.yml down -v
```

## Running All Tests (Full Suite)

From repo root:

```bash
# 1. Unit tests (no infra)
cd backend-ts && pnpm test && cd ..

# 2. Integration + HTTP tests
pnpm test:int
cd backend-ts && pnpm run test:http && cd ..

# 3. E2E tests
docker compose -f docker-compose.dev.yml down -v   # avoid volume conflict
docker compose -f docker-compose.e2e.yml down -v
docker compose -f docker-compose.e2e.yml up -d
# wait 20s, verify services
cd backend-ts && pnpm run build && cd ..
bash e2e/scripts/build-extension-e2e.sh
NODE_OPTIONS=--no-strip-types pnpm exec playwright test
docker compose -f docker-compose.e2e.yml down -v
```

## Common Issues

### Issue 1: `password authentication failed for user "e2e"`

**Cause:** Volume conflict — dev postgres volume (`pgdata` with `findwith` user) was reused when e2e compose started.

**Fix:**
```bash
docker compose -f docker-compose.dev.yml down -v
docker compose -f docker-compose.e2e.yml down -v
docker compose -f docker-compose.e2e.yml up -d
```

Verify: `docker exec find-with-postgres-1 psql -U e2e -d findwith_e2e -c "\du"` must show `e2e`, not `findwith`.

### Issue 2: `NODE_OPTIONS='--env-file=...'` fails

**Cause:** Node 25 does not allow `--env-file=` in `NODE_OPTIONS`.

**Fix:** Use the `parseEnvFile()` approach in `global-setup.ts` (already implemented), or source the file:
```bash
# This also fails in zsh non-interactive shell with relative paths:
set -a && . backend-ts/.env.e2e && set +a
# Use absolute paths:
set -a && . /absolute/path/to/backend-ts/.env.e2e && set +a
```

For TypeORM CLI, the global-setup approach (passing env via `{ env: {...process.env, ...envVars} }`) is the correct method.

### Issue 3: ECONNREFUSED running tests before infra is up

**Fix:** Ensure docker compose started and services are healthy:
```bash
# For test infra (integration tests):
docker compose -f docker-compose.test.yml up -d --wait

# For e2e infra:
docker compose -f docker-compose.e2e.yml up -d
sleep 20
curl -sf http://localhost:14811/health   # mock-clerk should return {"ok":true}
```

### Issue 4: Extension config has wrong port

**Symptom:** E2E tests fail to reach backend; extension talks to wrong port.

**Check:**
```bash
cat extension/dist-e2e/chunks/config-*.js
```

Expected: `const t="http://localhost:14807"`. If not, rebuild:
```bash
bash e2e/scripts/build-extension-e2e.sh
```

### Issue 5: `tsx: command not found`

Use `pnpm exec tsx` instead of bare `tsx`. The binary is in the workspace's node_modules.

## Compose File Summary

| Compose File | Purpose | Key Ports |
|--------------|---------|-----------|
| `docker-compose.dev.yml` | Local development | PG:14600, Redis:14601, MinIO:14602/14603, Mailpit:14604/14605, mock-dom:14608, mock-llm:14609, mock-stripe:14610, mock-clerk:14611 |
| `docker-compose.test.yml` | Integration/HTTP tests | PG:14700, Redis:14701, MinIO:14702/14703, Mailpit:14704/14705, mock-stripe:14710, mock-clerk:14711 |
| `docker-compose.e2e.yml` | E2E tests | PG:14800, Redis:14801, MinIO:14802/14803, Mailpit:14804/14805, mock-dom:14808, mock-llm:14809, mock-stripe:14810, mock-clerk:14811 |

## Scripts Reference

From repo root:

| Command | Action |
|---------|--------|
| `pnpm test:infra:up` | Start test infra (147xx), wait for healthy |
| `pnpm test:infra:down` | Stop test infra |
| `pnpm test:int` | Start test infra + run integration tests (migration included) |
| `pnpm e2e:up` | Start E2E infra (does NOT wait) |
| `pnpm e2e:down` | Stop E2E infra + remove volumes |
| `pnpm build:extension:e2e` | Build extension with VITE_API_BASE=http://localhost:14807 |
| `pnpm e2e` | Run Playwright tests (alias for `NODE_OPTIONS=--no-strip-types playwright test`) |

From `backend-ts/`:

| Command | Action |
|---------|--------|
| `pnpm test` | Unit tests (no infra) |
| `pnpm run test:int` | Integration tests (requires 147xx infra) |
| `pnpm run test:http` | HTTP tests (requires 147xx infra) |
| `pnpm run test:int:migrate` | Run migrations for integration test DB |
| `pnpm run migration:run` | Run TypeORM migrations against DATABASE_URL in .env |
