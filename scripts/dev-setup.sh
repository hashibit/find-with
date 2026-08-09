#!/usr/bin/env bash
set -euo pipefail

# FindWith local development setup
# Run once after cloning: ./scripts/dev-setup.sh
# Idempotent — safe to re-run.

cd "$(dirname "$0")/.."
ROOT=$(pwd)

echo ""
echo "=== FindWith Dev Setup ==="
echo ""

# 1. Check prerequisites
echo "--- Checking prerequisites ---"

command -v docker >/dev/null 2>&1 || { echo "ERROR: docker not found. Install Docker Desktop."; exit 1; }
command -v pnpm >/dev/null 2>&1 || { echo "ERROR: pnpm not found. Install: npm install -g pnpm"; exit 1; }
command -v node >/dev/null 2>&1 || { echo "ERROR: node not found. Install Node.js 20+."; exit 1; }

echo "  docker: $(docker --version 2>&1 | head -1)"
echo "  pnpm: $(pnpm --version)"
echo "  node: $(node --version)"

# 2. Install dependencies
echo ""
echo "--- Installing dependencies ---"
pnpm install

# 3. Start Docker services
echo ""
echo "--- Starting Docker services ---"
docker compose -f docker-compose.dev.yml up -d

# Wait for postgres
echo "  Waiting for PostgreSQL..."
for i in $(seq 1 30); do
    if docker compose -f docker-compose.dev.yml exec -T postgres pg_isready -U findwith >/dev/null 2>&1; then
        echo "  PostgreSQL ready."
        break
    fi
    sleep 1
done

# 4. Enable pgvector
echo ""
echo "--- Enabling pgvector extension ---"
docker compose -f docker-compose.dev.yml exec -T postgres psql -U findwith -d findwith -c "CREATE EXTENSION IF NOT EXISTS vector;" 2>/dev/null || true

# 5. Run migrations
echo ""
echo "--- Running database migrations ---"
cd "$ROOT/backend-ts"
pnpm run migration:run
cd "$ROOT"

# 6. Seed dev data
echo ""
echo "--- Seeding dev data ---"
NO_PROXY=localhost,127.0.0.1 no_proxy=localhost,127.0.0.1 \
  pnpm --filter @findwith/e2e exec tsx ../scripts/seed-dev.ts

# 7. Create .env if missing
if [ ! -f backend-ts/.env ]; then
    echo ""
    echo "--- Creating backend-ts/.env from .env.example ---"
    cp .env.example backend-ts/.env
    echo "  Created. Edit backend-ts/.env with your API keys."
fi

echo ""
echo "=== Setup Complete ==="
echo ""
echo "Start development:"
echo "  Backend:    cd backend-ts && pnpm run start:dev"
echo "  Extension:  cd extension && pnpm dev"
echo "  Website:    cd web && pnpm dev"
echo ""
echo "Or use Makefile:"
echo "  make dev          # Start infra + migrate + seed + backend"
echo "  make up / down    # Docker services only"
echo "  make migrate      # Run DB migrations"
echo ""
echo "Services:"
echo "  Backend:     http://localhost:14607"
echo "  Website:     http://localhost:14606"
echo "  MinIO:       http://localhost:14603 (findwith / findwith_dev)"
echo "  Mailpit:     http://localhost:14605"
echo "  PostgreSQL:  localhost:14600 (findwith / findwith_dev)"
echo "  Redis:       localhost:14601"
