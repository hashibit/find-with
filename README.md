# Quinn

**An AI agent here to help you finding a job.**


<img src="https://raw.githubusercontent.com/hashibit/find-with/refs/heads/main/docs/logo/quinn.png" width="128" height="128" valign="middle">

Your AI partner (Quinn) an opinionated, always-present collaborator that helps you think, tailor, and track — while keeping every final decision in your hands.

---

## What makes it different

### Quinn has a personality and opinions

Quinn pushes back when a job is a bad fit, gives concrete recommendations instead of hedge answers, and tells you when it doesn't know something. Built against the PRD's character spec — not a feature wrapper in a trench coat.

### The material library

Every conversation mines for "shining moments" — achievements you didn't know were valuable. These get tagged, stored, and reused across every future application. Your resume becomes a filtered view of a richer corpus, not a static document.

### Three-layer match analysis

Not a keyword overlap percentage. Three distinct signals:

1. **Surface match** — what ATS sees (keywords in your resume vs. JD)
2. **Deep match** — what your material library covers that your resume doesn't
3. **Gap analysis** — what's in the JD that neither your resume nor your library addresses, with targeted conversation prompts to fill it

### Traceable resume bullets

Every generated bullet traces back to something you actually said. Unverified bullets are flagged. Quinn cannot fabricate experience.

### Companion density controls

Three modes (Engaged / Balanced / Quiet) users can switch mid-conversation. Quinn honors them without needing to be reminded.

### Graceful exit

When a user accepts an offer, Quinn archives the journey and pauses the subscription. The product's job is done. This is intentional.

---

## Architecture

```
monorepo/
├── backend-ts/       # NestJS 10 API (this is the core)
├── extension/        # Chrome extension (Side Panel + content scripts)
├── web/              # Marketing + account management site
└── proto/            # Protobuf definitions (buf.build)
```

### Backend stack

| Layer            | Technology                                                 |
| ---------------- | ---------------------------------------------------------- |
| HTTP framework   | NestJS 10                                                  |
| ORM              | TypeORM 0.3 (PostgreSQL 15 + pgvector)                     |
| Job queues       | BullMQ + Redis                                             |
| AI orchestration | Custom `AgentService` (OpenAI primary, Anthropic failover) |
| Auth             | Clerk (JWKS-based JWT, 1hr cache)                          |
| Payments         | Stripe + Svix webhook verification                         |
| Storage          | S3-compatible (MinIO in dev)                               |
| Field encryption | AES-256-GCM envelope encryption (nonce+ct+tag as `bytea`)  |
| Observability    | nestjs-pino + Sentry                                       |
| API docs         | OpenAPI via `@nestjs/swagger`                              |

### Domain contexts (DDD)

```
contexts/
├── iam/           # Settings, auth, Clerk webhook sync
├── profile/       # Resume parsing, material library, base resumes
├── jobs/          # JD ingestion, company research, radar state machine
├── conversation/  # SSE chat, Quinn agent loop, message persistence
├── tailoring/     # Resume generation, match scoring, BullMQ processors
├── apply/         # LinkedIn Easy Apply automation
├── followup/      # Email classification, reply drafting, follow-up timing
├── quota/         # Export-gated consumption, idempotent log
├── recommendation/# Daily job recommendations, feedback loop
└── infra/         # Webhooks, health, telemetry
```

### Quinn's agent tools

The `AgentService` drives a tool-use loop over SSE. Six registered tools, each scoped to specific conversation scenes:

| Tool                       | Scene                  |
| -------------------------- | ---------------------- |
| `search_company`           | Job analysis           |
| `mine_shining_point`       | Onboarding, gap mining |
| `draft_motivation`         | Form fill              |
| `classify_email`           | Email follow-up        |
| `draft_reply`              | Email follow-up        |
| `set_conversation_density` | All                    |

Resume generation, bullet editing, and match recomputation run as BullMQ processors in the `TAILORING` queue — not as agent tools — because they need async progress reporting.

### Pluggable adapters

Auth, payment, crypto, and storage are abstracted behind interfaces with dev stubs (`DevAuthAdapter`, `EphemeralCryptoAdapter`, etc.) so you can run the full stack without Clerk/Stripe credentials during development.

---

## Development setup

### Prerequisites

- Node.js 20+
- pnpm 9+
- Docker (for local services)

### 1. Start local services

```bash
make up
# Starts: PostgreSQL 15, Redis 7, MinIO, Mailpit
# Postgres: localhost:5432
# Redis: localhost:6379
# MinIO console: localhost:9001
# Mailpit UI: localhost:8025
```

### 2. Configure environment

```bash
cp backend-ts/.env.example backend-ts/.env
```

Minimum required for local dev (everything else has defaults or stubs):

```env
OPENAI_API_KEY=sk-...          # or set ANTHROPIC_API_KEY instead
CRYPTO_KEK=<base64 32-byte>    # generate: openssl rand -base64 32
CRYPTO_DEK_CIPHERTEXT=...      # generate: npm --prefix backend-ts run generate-keys
```

For Clerk + Stripe, the dev adapters will stand in if you omit the keys — useful for unit/integration work without external accounts.

### 3. Install dependencies

```bash
npm --prefix backend-ts install
pnpm install   # extension + web
```

### 4. Run migrations

```bash
make migrate
```

### 5. Start the backend

```bash
make dev
# NestJS starts on :3000, watches for changes
# Swagger UI: http://localhost:3000/api/v1/docs
```

### Extension (Side Panel)

```bash
make build-extension
# Load dist/extension in Chrome:
# chrome://extensions → Developer mode → Load unpacked
```

### Common make targets

```bash
make lint              # lint all (proto + backend + extension + web)
make test              # unit tests (all packages)
make test-integration  # integration tests (spins up testcontainers)
make test-e2e-mock     # Playwright E2E with mocked backend
make migrate           # run pending TypeORM migrations
make migration msg=foo  # generate new migration named foo
make down              # stop local services
make clean             # stop + wipe volumes + delete dist/node_modules
```

### Proto generation

Protobuf definitions live in `proto/`. After editing `.proto` files:

```bash
make proto
```

Requires [buf CLI](https://buf.build/docs/installation).

---

## Testing

| Layer            | Command                 | Notes                                         |
| ---------------- | ----------------------- | --------------------------------------------- |
| Unit (L2)        | `make test`             | Jest, no external deps                        |
| Integration (L3) | `make test-integration` | Testcontainers, pulls Postgres + Redis images |
| E2E mocked (L4)  | `make test-e2e-mock`    | Playwright + Docker Compose test stack        |

Unit tests live alongside source files as `*.spec.ts`. Integration tests are in `backend-ts/test/integration/`.

---

## Memory architecture

Quinn's context is built from four layers, assembled on every agent turn:

```
┌────────────────────────────────────────────────────────┐
│ Layer 4: Goal Memory (UserGoalMemory)                  │
│ Permanent, per-user. Extracted from conversation text. │
│ "target roles, deal breakers, salary floor, etc."      │
├────────────────────────────────────────────────────────┤
│ Layer 3: Semantic Memory (ProfileMaterial.embedding)   │
│ pgvector cosine search anchored to the current JD.     │
│ "the 8 most relevant shining points for this role"     │
├────────────────────────────────────────────────────────┤
│ Layer 2: Episodic Memory (ConvRollingSummary)          │
│ Rolling compression once active messages exceed the    │
│ token threshold. Summaries persist across sessions.    │
│ "what happened in earlier parts of this conversation"  │
├────────────────────────────────────────────────────────┤
│ Layer 1: Working Memory (conv_messages, archived=false)│
│ The live context window — most recent messages only.   │
└────────────────────────────────────────────────────────┘
```

### How each layer works

**Layer 1 — Working memory.** `ContextBuilderService` queries `conv_messages` filtered to `archived = false`, ordered DESC, capped at 30. Only the live tail of the conversation enters the prompt.

**Layer 2 — Episodic memory.** After every agent turn, `compressIfNeeded` checks token volume. When it exceeds `TOKEN_COMPRESS_THRESHOLD` (10 000 tokens), the oldest messages are summarised by an LLM call, written to `conv_rolling_summary`, and their originals are flipped to `archived = true`. Summaries from prior sessions of the same conversation `kind` are injected as cross-session context for new conversations.

**Layer 3 — Semantic memory.** When `MineShiningPointTool` saves a material it immediately generates and stores a `text-embedding-3-small` embedding. When the `JobsProcessor` parses a JD it embeds the title + skills text and stores `jdEmbedding`. At context-build time, if the conversation has an anchor (a radar item), `ContextBuilderService` resolves its JD embedding and ranks all confirmed materials by cosine similarity, injecting the top-8 instead of the default time-ordered top-20.

**Layer 4 — Goal memory.** After every agent turn, `extractAndSaveGoalMemory` runs an async LLM call over the user's messages to extract structured preferences (`targetRoles`, `locationPrefs`, `dealBreakers`, `salaryFloorUsd`, etc.) and upserts them into `user_goal_memory`. These are injected at the top of every system prompt so Quinn always knows the user's standing preferences, even in a brand-new conversation.

### Database tables added

| Table | Purpose |
|---|---|
| `conv_rolling_summary` | Layer 2 — one row per compression event |
| `user_goal_memory` | Layer 4 — one row per user, upserted each turn |

---

## Key design decisions

**Quota consumed at export, not at tailoring creation.** A user can generate multiple tailored resumes and only pays (in quota) when they export one as PDF. Matches the Python implementation's `consume_on_export` semantics. `QuotaConsumeLog.tailoredResumeId` has a UNIQUE constraint to prevent double-charges on retry.

**No Gmail API.** Email reading works by having the user open the email in their browser and letting the content script read the DOM. No OAuth, no stored email content beyond conversation context. This is a deliberate product choice.

**Field encryption at the application layer.** `ProfileMaterial.rawText` and `FollowupEmail.bodyText` are AES-256-GCM encrypted as `bytea` columns. Wire format: `nonce[12] + ciphertext + authTag[16]`. The database never sees plaintext for these fields.

**`UserOwnedSingletonEntity` for 1:1 entities.** `IamSettings`, `ProfileProfile`, and `QuotaUsageCounter` use `userId` as the primary key. They are not versioned/audited rows — there is exactly one per user.

---

## License

See [LICENSE](./LICENSE). Source-available: free to read, study, and run locally. You may not offer FindWith (or a substantially similar product built from this codebase) as a hosted service to third parties.

---

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md).
