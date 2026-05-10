.PHONY: dev ci test lint proto clean

# Dev
dev: up
	cd backend && uv run --project .. uvicorn app.main:app --reload --port 14667

# CI — one command runs all stacks
ci: lint test

# Lint
lint: lint-proto lint-backend lint-ext lint-web

lint-proto:
	buf lint
	buf breaking --against .git#branch=main || true

lint-backend:
	uv run ruff check backend/app/
	uv run mypy backend/app/ --ignore-missing-imports

lint-ext:
	cd extension && pnpm run lint 2>/dev/null || true

lint-web:
	cd web && pnpm run lint 2>/dev/null || true

# Test
test: test-backend test-ext test-web

test-backend:
	ENVIRONMENT=test uv run python -m pytest backend/tests/test_crypto.py backend/tests/test_health.py backend/tests/unit/ -x -q

test-ext:
	cd extension && pnpm test 2>/dev/null || true

test-web:
	cd web && pnpm test 2>/dev/null || true

# Integration tests (L3 — pulls testcontainers)
test-integration:
	uv run pytest backend/tests/integration/ -n 4 -m integration -v --timeout=120

# Webhook regression subset (U-11/U-12)
test-webhooks:
	uv run pytest backend/tests/integration/iam/ -v

# Extension build
build-extension:
	cd extension && pnpm build

# E2E mocked (L4 — Playwright + extension)
test-e2e-mock:
	docker compose -f docker-compose.test.yml up -d --wait
	uv run playwright test --project=e2e-mock || true
	docker compose -f docker-compose.test.yml down

# E2E OrbStack VM (L5)
e2e-orbstack:
	@echo "Starting OrbStack E2E..."
	orb start findwith-e2e 2>/dev/null || orb create ubuntu findwith-e2e
	orb push findwith-e2e . /workspace
	orb ssh findwith-e2e -- "cd /workspace && docker compose -f compose.e2e.yml up -d --wait"
	orb ssh findwith-e2e -- "cd /workspace && pnpm -C extension build"
	orb ssh findwith-e2e -- "cd /workspace && pnpm playwright test --project=e2e-orbstack"
	orb stop findwith-e2e

e2e-orbstack-shell:
	orb ssh findwith-e2e

# Reconcile (staging dry-run)
reconcile-staging:
	uv run python backend/scripts/reconcile_stripe_subscriptions.py --dry-run --output=/tmp/drift.csv

# Performance (L7)
perf-staging:
	k6 run backend/tests/perf/k6_baseline.js

# CI composites
ci-pr: lint test
ci-nightly: lint test test-integration
ci-release: lint test test-integration test-e2e-mock

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
	cd backend && uv run alembic -c alembic.ini upgrade head

migration:
	cd backend && uv run alembic -c alembic.ini revision --autogenerate -m "$(msg)"

# DR
dr-dry-run:
	bash scripts/dr/restore-from-r2.sh --dry-run
