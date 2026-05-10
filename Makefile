.PHONY: dev ci test lint proto clean

# Dev
dev:
	docker compose -f docker-compose.dev.yml up -d
	cd backend && uv run uvicorn app.main:app --reload --port 8000

# CI — one command runs all stacks
ci: lint test

# Lint
lint: lint-proto lint-backend lint-ext lint-web

lint-proto:
	buf lint
	buf breaking --against .git#branch=main || true

lint-backend:
	cd backend && uv run ruff check .
	cd backend && uv run mypy app/

lint-ext:
	cd extension && pnpm run lint 2>/dev/null || true

lint-web:
	cd web && pnpm run lint 2>/dev/null || true

# Test
test: test-backend test-ext test-web

test-backend:
	cd backend && uv run pytest -x -q

test-ext:
	cd extension && pnpm test 2>/dev/null || true

test-web:
	cd web && pnpm test 2>/dev/null || true

# Proto generation
proto:
	buf generate
	@echo "Proto generation complete"

# Docker
up:
	docker compose -f docker-compose.dev.yml up -d

down:
	docker compose -f docker-compose.dev.yml down

# Clean
clean:
	docker compose -f docker-compose.dev.yml down -v
	find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name .pytest_cache -exec rm -rf {} + 2>/dev/null || true

# DB
migrate:
	cd backend && uv run alembic upgrade head

migration:
	cd backend && uv run alembic revision --autogenerate -m "$(msg)"

# DR
dr-dry-run:
	bash scripts/dr/restore-from-r2.sh --dry-run
