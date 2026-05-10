# Contributing to FindWith

## Proto Evolution Constraints (U-09)

**protobuf is the single source of truth.** All three stacks (backend, extension, web) derive their models from proto. Breaking changes must follow strict deployment ordering.

### Deployment Order (mandatory)

```
additive changes:    backend first → extension/web later
breaking changes:    extension first (stop reading) → backend later (delete field)
enum new values:     all readers first (handle unknown) → writer last
```

### Detailed Rules

1. **Adding a field (backward compatible)**
   - PR-1: Add to proto + backend writes new field + tests → merge → deploy backend
   - PR-2: Extension reads new field (with fallback for old backend) → Chrome Web Store submit
   - PR-3: Web reads new field → deploy

2. **Removing a field (breaking)**
   - Requires `proto-change` label on PR
   - Step 1: All readers stop relying on the field (deploy extension + web first)
   - Step 2: Wait for old extension install rate < 5% (check telemetry `ext_version`)
   - Step 3: Backend stops writing → proto removes field

3. **Adding enum value**
   - Step 1: All readers handle unknown values gracefully (default/fallback branch)
   - Step 2: Backend starts writing new value

### CI Enforcement

- `buf lint` runs on every push
- `buf breaking --against=.git#branch=main` runs on PRs
- PRs touching `proto/` must have the `proto-change` label for additional review
- Alembic: `alembic check --autogenerate` must produce empty diff (no manual schema drift)

## Branch Strategy

- `main` — always green, all PRs merge here
- `feature/*` — short-lived feature branches
- `release/*` — cut from main for e2e testing before deploy
- Sprint tags: `sprint-N` at each sprint end

## Code Style

### Backend (Python)
- Formatter: `ruff format`
- Linter: `ruff check`
- Type checker: `mypy --strict`
- Test: `pytest`

### Extension (TypeScript)
- Linter: ESLint
- Formatter: Prettier
- Test: Vitest + Playwright

### Web (Next.js)
- Same as extension

## Alembic Ownership (U-01)

The `backend/` repository is the **sole owner** of Alembic migrations. The web (Next.js) repository does NOT run migrations.

If the website needs a new table or column:
1. Submit an Alembic PR to the backend repository
2. Reference the migration revision in the website PR
3. Website CI verifies `alembic current >= referenced revision`

## Commit Messages

Use conventional commits:
```
feat: add resume upload endpoint
fix: handle empty JD in parser
docs: update API reference for tailoring
chore: bump fastapi to 0.115
```

## Security

- Never commit `.env` files or secrets
- Encrypted fields (resume, email body, material.raw_text) use AES-256 envelope encryption
- All sensitive data must go through `app.security.crypto.encrypt_field()`
