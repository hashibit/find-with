# conv_messages Restructure — Design Record

> Status: implemented (2026-09-04). Destructive migration applied to dev and
> test databases; live SSE agent-loop verification (multi-turn conversation
> with tool calls against a real provider) still to be exercised manually.
> Scope: schema and access-path redesign of `conv_messages`, plus a new
> `conv_tool_calls` table. Destructive migration — existing conversation data
> is discarded (pre-launch, confirmed with product owner).
> When this lands, update `security-inventory.md` §2/§3 to match (its header
> rule applies: touching any crypto path requires updating that doc).

## 1. Problem

The as-built `conv_messages` encryption is not self-consistent:

1. **Phantom plaintext next to ciphertext.** `saveAssistant`
   (`agent/conv-message.repository.ts:23`) encrypts `fullText` into
   `encryptedText` while storing the same plaintext inside `payload` jsonb —
   the full pi-ai `AssistantMessage` contains the text in its content blocks.
   Assistant-message encryption is decorative. `TOOL_RESULT` rows are
   plaintext-only (payload, no `encryptedText` at all).
2. **Ghost column.** `text` is always written `null`, but
   `memory.processor.ts:104-115` builds the goal-extraction transcript from
   `m.text` — silently empty today.
3. **Storage mirrors a third-party struct.** `payload` persists the pi-ai
   `Message` object verbatim, including transient fields (`usage.cost`,
   `diagnostics`, `rawStopReason`). A pi-ai upgrade changes the struct; old
   and new rows silently diverge in shape. The DB should own its schema, not
   be a dump target for a package's internals.
4. **Latent replay hazard.** An assistant row can carry `toolCall` blocks with
   no matching `TOOL_RESULT` row (crash between the two writes). Replay then
   produces `tool_use` without `tool_result` — Anthropic rejects the request
   with 400 and the conversation is bricked.

## 2. Constraints that shaped the design

- **Replay.** Provider APIs are stateless; every user turn re-sends the full
  history. The DB is the only source for reconstructing valid requests, so
  whatever we store must round-trip: `ToolCall.id/name/arguments`,
  `ToolResultMessage.toolCallId`, and — on the Anthropic path — thinking
  blocks with their `thinkingSignature` intact (missing/modified signatures →
  400). `reasoning: provider === 'anthropic'` is enabled
  (`llm/llm.service.ts:93`), so thinking storage is load-bearing, not
  optional. The OpenAI-completions path drops thinking on replay; storing it
  is harmless there.
- **Token accounting.** `context-builder.service.ts:205` reads
  `payload.usage.totalTokens` for the compression threshold. Its replacement
  is *not* metadata: the only consumer is a heuristic, and AES-GCM ciphertext
  length is a uniform no-decrypt size proxy — wire format is
  `nonce[12] + ciphertext + tag[16]`, so `octet_length(blob) - 28` equals the
  plaintext byte count for every encrypted column in both tables. Exact
  per-request token data stays in `token_usage_logs` (telemetry's job); if
  per-conversation analytics are ever needed, add linkage columns there.
- **PII boundary.** Tool arguments and tool results can embed user content;
  they must be encrypted. Tool names, tool call ids, provider, model,
  stopReason, responseId, usage counts are non-sensitive and may be plaintext
  (they are the point of structured storage — queryability).

## 3. Decisions (with rejected alternatives)

### D1 — `role` means speaker; only `USER | ASSISTANT`

A role is a conversation participant. A tool call is an *action* (the
assistant decided to do something), a tool result is an *observation*
(nobody spoke). Neither is a role.

- *Rejected: `TOOL_CALL`/`TOOL_RESULT` as roles in `conv_messages`.* Works,
  but the role column degenerates into a storage-unit-type discriminator, and
  call/result split across two rows needs join-based pairing with an orphan
  state (call row written, result row not).
- *Rejected: folding tool results into `USER` rows* (what Anthropic's wire
  format does internally). That is a wire-format implementation detail.
  Concretely harmful here: `memory.processor.ts` extracts `role === 'USER'`
  rows as the user's own words for goal extraction — tool output JSON would
  leak into that transcript.

### D2 — Tool invocations live in their own table: `conv_tool_calls`

One row = one complete invocation (arguments + result together, atomic).

- *Rejected: one encrypted JSON blob per assistant row
  (`encryptedToolCalls`).* Fewest tables, but tool activity becomes
  unqueryable-without-decrypting — against the structured-storage goal.
- *Rejected: blob-encrypt the whole pi-ai message per row.* Lossless for
  replay, but mirrors the third-party struct (the original complaint) and
  hides everything behind an opaque column.

Pairing is by explicit ids only (`assistantId`), never by row order. This
invariant was held across every iteration of the design.

### D3 — Sensitive content in encrypted columns, structure in plaintext

`conv_messages` carries two encrypted content columns (text, thinking) and
a plaintext `metadata` jsonb. `conv_tool_calls` carries two encrypted columns
(arguments, result) and plaintext relational attributes. Non-sensitive
metadata (provider/model/stopReason/responseId) is plaintext *on
purpose*: it keeps debugging queryable without decrypting, and it is not user
content. Usage is deliberately excluded — see the token-accounting constraint
in §2.

### D4 — Destructive migration

Old conversations are discarded (pre-launch). The migration is pure DDL +
table truncation; no crypto is constructed inside the migration (it would
have been the repo's first data migration — avoided deliberately).

## 4. Target schema

### `conv_messages` (transcript; speakers only)

| Column | Type | USER | ASSISTANT |
|---|---|---|---|
| `role` | varchar | `USER` | `ASSISTANT` |
| `encryptedText` | bytea, nullable | user input | joined text blocks |
| `encryptedThinking` | bytea, nullable | — | thinking blocks JSON: `[{thinking, thinkingSignature?, redacted?}]` |
| `metadata` | jsonb, nullable | null | `{provider, model, responseId?, stopReason, errorMessage?}` |
| `archived` | boolean | kept as-is | kept as-is |

Dropped: `text`, `payload`. `metadata` deliberately excludes `usage` (token
estimation uses ciphertext byte length, §2; exact numbers live in
`token_usage_logs`) and `usage.cost`/`responseModel`/`diagnostics`/
`rawStopReason` (derivable, transient, or internal).

### `conv_tool_calls` (new; one row per invocation)

| Column | Type | Notes |
|---|---|---|
| `id` | varchar(26) PK | ulid |
| `conversationId` | varchar(26), indexed | |
| `assistantId` | varchar(26), indexed | the ASSISTANT row this call belongs to; no FK (repo-wide convention: no FK constraints) |
| `toolCallId` | varchar, indexed | provider call id; SSE correlation & debugging |
| `toolName` | varchar | plaintext — non-sensitive, queryable |
| `seq` | int | order among the turn's calls |
| `encryptedArguments` | bytea | `JSON.stringify(call.arguments)` — PII |
| `encryptedResult` | bytea | result text — PII |
| `isError` | boolean | |
| `createdAt`/`updatedAt` | timestamptz | BaseEntity |

## 5. Write paths

`agent.service.ts` loop, unchanged timing (no update paths, no intermediate
states):

1. Stream ends → `saveAssistant(conversationId, finalMessage)` → one ASSISTANT
   row (text/thinking/metadata extracted from the message). Returns row id.
   The `fullText` parameter is removed (derivable from content blocks).
2. Per tool call → `executeTool` → build the in-memory `ToolResultMessage`
   (still pushed into the live `Context`) **and** `saveToolCall(...)`
   (`{toolCallId, toolName, seq, arguments, result, isError}`) — one atomic
   row per invocation.

Crash windows: assistant row written but tool rows not → replay sees an
assistant turn without toolCall blocks → valid request, model re-issues the
call next turn. No orphan handling needed by construction.

## 6. Read paths

### Replay reassembly — `findRecentForContext(conversationId, limit)`

1. Load non-archived `conv_messages` (ASC) + `conv_tool_calls` grouped by
   `assistantId`.
2. USER row → `{role:'user', content: decrypt(encryptedText), timestamp: createdAt}`.
3. ASSISTANT row → content = `[...thinkingBlocks, ...textBlocks, ...toolCallBlocks]`
   (canonical order = the order models actually emit; thinking → text →
   toolCalls), followed by its `ToolResultMessage`s in `seq` order. The
   `AssistantMessage` is a type-valid stub: `api: ''`, `provider`/`model` from
   metadata, zeroed `usage`, `stopReason: metadata.stopReason ?? 'stop'`. pi-ai's
   `transformMessages` only reads content blocks and `toolResult.toolCallId` —
   stub fields never reach the wire.
4. Rows that fail decryption or shape checks: warn-log + drop (existing
   silent-drop convention).
5. Trim to the last `limit` messages, cut aligned to a USER-row boundary.

### Compression — `findMessagesToCompress`, no decryption

Token estimates come from ciphertext byte lengths (`octet_length(blob) - 28`):
USER text from `encryptedText`, assistant turns from `encryptedText +
encryptedThinking`, tool results from `conv_tool_calls.encryptedResult`.
Uniform, decrypt-free, and fixes today's USER 0-token undercount (any real
blob exceeds the 28-byte overhead).

### Briefs — new `findDecryptedTurns(conversationId)`

Structured decrypted view `{id, role, text, calls: [{toolCallId, toolName,
resultText, isError}]}` for `messageBrief`, which feeds real content to the
summarizer LLM.

### Display — `conversation.service.findOne`

All rows of the conversation (role filter now redundant), decrypt
`encryptedText` → `text`, DTO drops `payload` and every ciphertext column.
Archived rows not filtered — existing behavior, unchanged.

## 7. Impact map

| File | Change |
|---|---|
| `src/database/migrations/<ts>-RestructureConvMessages.ts` | new; DDL per §4 + truncate `conv_messages`, `conv_rolling_summary` |
| `src/database/entities/conversation/message.entity.ts` | drop text/payload; add encryptedThinking/metadata; export `ConvMessageRole` |
| `src/database/entities/conversation/tool-call.entity.ts` | new |
| `src/database/data-source.ts` + module `forFeature` lists | register `ConvToolCall` |
| `src/agent/conv-message.repository.ts` | rewrite per §5–§6 |
| `src/agent/agent.service.ts` | saveAssistant signature; per-call saveToolCall; drop fullText |
| `src/agent/context-builder.service.ts` | compress via ciphertext-length estimates; briefs via `findDecryptedTurns` |
| `src/contexts/conversation/conversation.service.ts` | display DTO without payload |
| `src/contexts/followup/followup-scheduler.service.ts` | nudge row: drop payload write |
| `src/contexts/memory/memory.processor.ts` | decrypt USER text for transcript (fixes empty-transcript bug) |
| `extension/src/sidepanel/stores/conversation.ts` | drop `payload` field + fallback (text always populated) |
| `test/http/conversation.http.spec.ts`, `test/unit/followup/followup-scheduler.service.spec.ts` | update shapes/signatures |
| `test/unit/agent/conv-message.repository.spec.ts` | new: round-trip incl. thinking + multi-call, seq ordering, bad-row drop, metadata mapping |
| `docs/tech/security-inventory.md` | §2/§3 rewrite after landing |

## 8. Verification

1. Unit tests green, incl. the new repository spec.
2. `migration:run` → `migration:revert` → `migration:run` round-trip.
3. End-to-end multi-turn conversation **with tool calls**: SSE intact;
   `psql` shape check on both tables; **the second user turn must work**
   (replay reassembly is the risk hotspot); `GET /conversations/:id` returns
   decrypted text, no payload.
4. Sidepanel reload restores history (j06 or manual).

## 9. Explicitly out of scope (tracked follow-ups)

- `conv_rolling_summary.content` is plaintext — known gap, separate task.
- GDPR purge does not clean conv child tables (no FKs anywhere) — pre-existing
  gap, separate task.
- `FieldCrypto` wire-format version byte / per-user DEK (prerequisite for
  cheap KEK rotation and cryptographic account deletion) — separate decision.
- Per-conversation/per-message exact token analytics: `token_usage_logs` has
  no `conversationId`/message linkage today; add columns there if the need
  materializes. `conv_messages.metadata` intentionally stays usage-free.
- Profile-field encryption expansion (education/work/basicInfo aggregates) —
  no query paths exist yet; revisit with the structured-profile work.
