# Local Development Setup

## Prerequisites

- Docker (with Compose v2)
- Node.js 20+
- pnpm 9.x (`npm install -g pnpm@9`)
- Chrome browser

## Step 1 — Start Infrastructure

Start PostgreSQL, Redis, MinIO, and Mailpit:

```bash
docker compose -f docker-compose.dev.yml up -d
```

| Service  | URL                                        | Credentials                        |
| -------- | ------------------------------------------ | ---------------------------------- |
| Postgres | `localhost:5432`                           | `findwith` / `findwith_dev`        |
| Redis    | `localhost:6379`                           | —                                  |
| MinIO    | `http://localhost:9001` (console)          | `findwith` / `findwith_dev`        |
| Mailpit  | `http://localhost:8025` (web UI)           | —                                  |

## Step 2 — Configure Backend Environment

Copy the example env file if you haven't already:

```bash
cp backend-ts/.env.example backend-ts/.env
```

Fill in the required secrets:

| Key | Where to get it |
| --- | --------------- |
| `ANTHROPIC_API_KEY` | console.anthropic.com |
| `CLERK_SECRET_KEY` / `CLERK_JWKS_URL` | Clerk dashboard |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | Stripe dashboard |
| `CRYPTO_KEK` / `CRYPTO_DEK_CIPHERTEXT` | Generate locally (see below) |

Generate encryption keys:

```bash
cd backend-ts
node -e "require('./dist/scripts/generate-keys')"
```

## Step 3 — Run Database Migrations

```bash
cd backend-ts
pnpm run migration:run
```

## Step 4 — Start Backend

```bash
cd backend-ts
pnpm run start:dev
```

Backend runs at `http://localhost:3000` with hot reload via SWC.

## Step 5 — Start Extension

In a separate terminal:

```bash
cd extension
pnpm dev
```

This runs Vite in watch mode. Output goes to `extension/dist/`.

## Step 6 — Load Extension in Chrome

1. Open `chrome://extensions`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked** → select `extension/dist/`
4. After code changes, Vite rebuilds automatically — click the refresh icon on the extension card to reload

## Shortcut: Start Everything at Once

The Makefile wraps infra + backend in one command:

```bash
make dev
```

The extension watcher still needs to be started separately.

## Install Dependencies (first time or after pulling)

```bash
pnpm install
```

This installs dependencies for all workspaces (backend, extension, web, e2e).
