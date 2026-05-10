#!/usr/bin/env bash
set -euo pipefail

# FindWith local development setup
# Run once after cloning: ./scripts/dev-setup.sh

cd "$(dirname "$0")/.."
ROOT=$(pwd)

echo "=== FindWith Dev Setup ==="

# 1. Check prerequisites
echo ""
echo "--- Checking prerequisites ---"

command -v docker >/dev/null 2>&1 || { echo "ERROR: docker not found. Install Docker Desktop."; exit 1; }
command -v uv >/dev/null 2>&1 || { echo "ERROR: uv not found. Install: curl -LsSf https://astral.sh/uv/install.sh | sh"; exit 1; }
command -v pnpm >/dev/null 2>&1 || { echo "ERROR: pnpm not found. Install: npm install -g pnpm"; exit 1; }
command -v node >/dev/null 2>&1 || { echo "ERROR: node not found. Install Node.js 20+."; exit 1; }

echo "  docker: $(docker --version | head -1)"
echo "  uv: $(uv --version)"
echo "  pnpm: $(pnpm --version)"
echo "  node: $(node --version)"

# 2. Python dependencies
echo ""
echo "--- Installing Python dependencies ---"
uv sync --dev

# 3. Generate dev encryption keys (if not set)
if ! grep -q "^KEK=.\+" backend/.env 2>/dev/null; then
    echo ""
    echo "--- Generating dev encryption keys ---"
    KEYS=$(uv run python -c "
from app.security.crypto import generate_dek_kek_pair
kek, dek_ct, _ = generate_dek_kek_pair()
print(f'KEK={kek}')
print(f'DEK_CIPHERTEXT={dek_ct}')
" 2>/dev/null || echo "")

    if [ -n "$KEYS" ]; then
        # Append to .env
        echo "$KEYS" >> backend/.env
        echo "  Keys generated and written to backend/.env"
    else
        echo "  WARN: Could not generate keys (app module not importable yet). Will use test mode."
    fi
fi

# 4. Start infrastructure
echo ""
echo "--- Starting Docker services ---"
docker compose -f docker-compose.dev.yml up -d

# Wait for postgres
echo "  Waiting for PostgreSQL..."
for i in {1..30}; do
    if docker compose -f docker-compose.dev.yml exec -T postgres pg_isready -U findwith >/dev/null 2>&1; then
        echo "  PostgreSQL ready."
        break
    fi
    sleep 1
done

# 5. Enable pgvector
echo ""
echo "--- Enabling pgvector extension ---"
docker compose -f docker-compose.dev.yml exec -T postgres psql -U findwith -d findwith -c "CREATE EXTENSION IF NOT EXISTS vector;" 2>/dev/null || true

# 6. Run migrations
echo ""
echo "--- Running database migrations ---"
cd backend
uv run --project .. alembic -c alembic.ini upgrade head 2>/dev/null || {
    echo "  No migrations yet. Generate initial migration:"
    echo "  cd backend && uv run --project .. alembic -c alembic.ini revision --autogenerate -m 'initial'"
}
cd "$ROOT"

# 7. Create MinIO bucket
echo ""
echo "--- Creating MinIO bucket ---"
docker compose -f docker-compose.dev.yml exec -T minio mc alias set local http://localhost:9000 findwith findwith_dev 2>/dev/null || true
docker compose -f docker-compose.dev.yml exec -T minio mc mb local/findwith-dev 2>/dev/null || true

# 8. Frontend dependencies
echo ""
echo "--- Installing frontend dependencies ---"
if [ -f extension/package.json ]; then
    cd extension && pnpm install && cd "$ROOT"
fi
if [ -f web/package.json ]; then
    cd web && pnpm install && cd "$ROOT"
fi

echo ""
echo "=== Setup Complete ==="
echo ""
echo "Start development:"
echo "  Backend:    cd backend && uv run --project .. uvicorn app.main:app --reload --port 14667"
echo "  Extension:  cd extension && pnpm dev"
echo "  Website:    cd web && pnpm dev"
echo ""
echo "Or use Makefile:"
echo "  make dev          # Start infra + backend"
echo "  make up / down    # Docker services only"
echo "  make migrate      # Run DB migrations"
echo ""
echo "Services:"
echo "  API:        http://localhost:14667"
echo "  API docs:   http://localhost:14667/docs"
echo "  Website:    http://localhost:14666"
echo "  MinIO:      http://localhost:9001 (findwith / findwith_dev)"
echo "  Mailpit:    http://localhost:8025"
echo "  PostgreSQL: localhost:5432 (findwith / findwith_dev)"
echo "  Redis:      localhost:6379"
