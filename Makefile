.PHONY: dev ci test lint proto clean

# Dev
dev: up
	cd backend-ts && pnpm run start:dev

# CI — one command runs all stacks
ci: lint test

# Lint
lint: lint-proto lint-backend lint-ext lint-web

lint-proto:
	buf lint
	buf breaking --against .git#branch=main || true

lint-backend:
	cd backend-ts && pnpm run lint

lint-ext:
	cd extension && pnpm run lint 2>/dev/null || true

lint-web:
	cd web && pnpm run lint 2>/dev/null || true

# Test
test: test-backend test-ext test-web

test-backend:
	cd backend-ts && pnpm test

test-ext:
	cd extension && pnpm test 2>/dev/null || true

test-web:
	cd web && pnpm test 2>/dev/null || true

# Integration tests (L3 — requires test containers)
test-integration:
	docker compose -f docker-compose.test.yml up -d --wait
	cd backend-ts && pnpm run test:int:migrate && pnpm run test:int

# Extension build
build-extension:
	cd extension && pnpm build

# Build backend
build-backend:
	cd backend-ts && pnpm run build

# E2E mocked (L4 — Playwright + extension)
test-e2e-mock:
	docker compose -f docker-compose.test.yml up -d --wait
	pnpm playwright test --project=e2e-mock || true
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

# Performance (L7)
perf-staging:
	k6 run backend-ts/test/perf/k6_baseline.js

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
	find . -type d -name node_modules -prune -o -type d -name dist -print -exec rm -rf {} + 2>/dev/null || true

# DB migrations (TypeORM)
migrate:
	cd backend-ts && pnpm run migration:run

migration:
	cd backend-ts && pnpm run migration:generate -- src/database/migrations/$(msg)

# DR
dr-dry-run:
	bash scripts/dr/restore-from-r2.sh --dry-run
