# Architecture Review — 2026-06-05

**Scope**: `backend-ts/src/agent/` · `backend-ts/src/contexts/tailoring/` · `backend-ts/src/database/entities/tailoring/` · `extension/src/sidepanel/stores/` · `extension/src/lib/runtime.ts`
**Branch**: `main`
**Author**: claude-sonnet-4-6
**Peer-reviewed by**: claude-sonnet-4-6 (0-3.2) — see `.ccbus/cccombat/arch-review-2026-06-05-seq-2-0-3.2.md`

---

## Summary

7 deepening candidates after peer review corrections. 2 are strong (AA-3, Missing-1). 5 are worth exploring. Recommended sequence: AA-3 → Missing-2 → Missing-1 → AA-1 → AA-5. AA-2 and AA-4 deferred.

---

## AA-3 — TailoringResume: denormalized bullets with implicit schema

**Strength**: Strong · **Priority**: 1

**Files**:
- `backend-ts/src/database/entities/tailoring/tailoring-resume.entity.ts` — `sections: unknown[] | null` column
- `backend-ts/src/contexts/tailoring/tailoring.service.ts` — three separate `as Array<...>` casts at lines 51-53, 88-90, 111-115
- `backend-ts/src/contexts/tailoring/tailoring.processor.ts` — writes bullet structure to JSONB

**Problem**:

`TailoringResume.sections` is typed as `unknown[] | null` in a `jsonb` column. The actual structure — sections with title and bullets, where each bullet has `{ id, text, source, sourceId, status }` — is an implicit contract enforced only by convention between the processor (writer) and the service (reader).

The schema drifts between the three call sites: `editBullet` assumes `{id, text, source, status?}`, `reApplyMaterial` assumes `{id, text, sourceId?, status?}`, `getSections` assumes `{id, text, status}`. Three callers, three implicit shapes, same column. `reApplyMaterial` validates `sourceId → Material` linkage by hand at runtime (lines 80-83) — no FK constraint enforces it.

Status states are string literals (`'PENDING'`, `'CONFIRMED'`, `'USER_EDITED'`) with no enum or DB constraint.

This matters because bullet provenance (`sourceId → ProfileMaterial`) is the product's core trust mechanism per PRD §四.4.4: "每条 bullet 必须有溯源" / "永远不允许 Quinn 凭空'创作'经历." The current implementation cannot enforce that promise at the data layer — a bullet can be inserted with a fabricated `sourceId` and nothing in the database will reject it.

**Deletion test**: remove the JSONB column and add a typed `TailoringBullet` entity → complexity concentrates at the entity with enforced schema. The JSONB column is a shortcut whose cost surfaces as data integrity bugs.

**Desired shape**:

A `TailoringBullet` entity with FK to `TailoringResume` and nullable FK to `ProfileMaterial`. `BulletStatus` as an enum column. Bullet editing logic (status transitions, re-apply material, provenance validation) concentrates in one module instead of being split across processor and service.

**Benefits**:
- **Leverage**: DB FK from `sourceId → profile_material.id` enforces provenance at the data layer
- **Locality**: bullet status transitions and edits are in one place
- **Testability**: mutations can be tested against real schema constraints rather than runtime casts

---

## Missing-2 — Quinn system prompt hardcoded in ContextBuilderService

**Strength**: Worth exploring · **Priority**: 2

**Files**:
- `backend-ts/src/agent/context-builder.service.ts:28-63` — `QUINN_SYSTEM_PROMPT` string constant (~35 lines)

**Problem**:

Quinn's character, voice rules, and ethics constraints are a ~35-line string constant `QUINN_SYSTEM_PROMPT` hardcoded in a service file. PRD §八 explicitly says the system prompt will have variants per scene and anticipates continuous iteration on this content. An artifact the PM and copy team need to iterate on is buried inside an engineering file with no versioning, no A/B surface, and no review path that excludes code.

Changing Quinn's tone requires a code change, a PR, and a deploy — the same pipeline as a bug fix.

**Desired shape**:

A `QuinnPromptProvider` interface with a file-backed implementation reading from a `prompts/` directory. v0.1 has one prompt file; the interface positions for: prompt versioning, scene-specific variants, A/B without redeploy, and copy review separate from code review.

**Benefits**:
- **Locality**: prompt content and prompt rendering logic are separate concerns
- **Leverage**: PM and copy can iterate on Quinn's voice without touching service files

---

## Missing-1 — `runAgentLoop` is a 183-line method mixing 5 concerns

**Strength**: Strong · **Priority**: 3

**Files**:
- `backend-ts/src/agent/agent.service.ts:215-398`

**Problem**:

`runAgentLoop` (183 lines) mixes: streaming subject management, encryption, persistence of 3 message types (`USER`, `ASSISTANT`, `TOOL_RESULT`), tool execution dispatch, telemetry emission, error handling, and memory queue dispatch. There is no clean seam between agent control flow and I/O coordination.

Changing message persistence (e.g., adding a new field to the message row) requires hunting through 3 blocks inside this single method. Adding a new SSE event type requires locating 4 `subject.next()` calls. The method is wider than it needs to be.

**Deletion test**: extract `MessagePersistence` and `AgentEventEmitter` collaborators → `runAgentLoop` becomes ~60 lines of control flow, and each extracted collaborator can be tested independently.

**Benefits**:
- **Locality**: message schema changes touch `MessagePersistence` only; SSE event changes touch `AgentEventEmitter` only
- **Testability**: control flow can be tested with stub collaborators; no full stack needed

---

## AA-1 — Agent Loop: all tools hardwired in constructor

**Strength**: Worth exploring · **Priority**: 4

**Files**:
- `backend-ts/src/agent/agent.service.ts:97-125` — constructor (17 deps: 4 repos, llm, fieldCrypto, memoryQueue, contextBuilder, 8 tools, configService)
- `backend-ts/src/agent/agent.module.ts:72-79` — provider registration
- `backend-ts/src/agent/tools/` — 8 tools: `SearchCompanyTool`, `MineShiningPointTool`, `DraftMotivationTool`, `ClassifyEmailTool`, `DraftReplyTool`, `SetConversationDensityTool`, `FarewellTool`, `RecomputeMatchTool`

**Problem**:

All 8 tools are injected into `AgentService`'s constructor. Adding a 9th tool requires editing 3 places: constructor parameters, `toolMap` initialization (lines 116-125), and module providers. The friction is real but small at 8 tools — a mechanical, type-safe, 30-second change.

A `ToolRegistry` seam earns its keep when: tools are loaded conditionally (per tenant, per feature flag), tool count crosses ~15, or tools are contributed by people outside the agent author's mental model. None of these apply today.

**Deletion test**: passes (registry concentrates, hardwiring scatters), but leverage is small because the friction it removes is small.

**Desired shape**: a `ToolRegistry` where tools self-register. `AgentService` constructor shrinks to `(ToolRegistry, LlmProvider, ContextBuilder)`.

**Revisit when**: tool count approaches 15, or conditional tool loading is needed.

---

## AA-5 — Message encryption: explicit coupling at every read/write site

**Strength**: Worth exploring · **Priority**: 5

**Files**:
- `backend-ts/src/agent/agent.service.ts:235, 306` — two explicit `fieldCrypto.encrypt()` call sites before message save
- `backend-ts/src/agent/context-builder.service.ts:227` — explicit `fieldCrypto.decrypt()` on message load
- `backend-ts/src/database/entities/conversation/message.entity.ts:13-19` — dual `text` / `encryptedText` columns, both nullable

**Problem**:

Every service reading or writing `ConvMessage` must call `fieldCrypto.encrypt()` / `decrypt()` explicitly. The entity interface does not signal that `.text` will be null without decryption. A new feature accessing messages (e.g., analytics) must know this convention; there is no compile-time or runtime signal if it's omitted.

The `FieldCrypto` seam itself is well-designed. The problem is where it's called.

**Proposed shape (corrected from initial review)**:

Not TypeORM `@AfterLoad` hooks — those cannot be async in TypeORM ≤0.3.x, and `FieldCrypto.decrypt()` is async (envelope crypto requires KMS roundtrips). The viable path is a `ConvMessageRepository` wrapper encapsulating encrypt-on-save / decrypt-on-load, so callers interact with plain strings and the crypto concern is contained at the repository boundary.

**Benefits**:
- **Locality**: crypto algorithm changes or key rotation touch the repository wrapper only
- **Testability**: services processing messages use plain strings in tests

---

## AA-2 — ContextBuilderService: mixed concerns in one method

**Strength**: Worth exploring · **Priority**: after Missing-1 if pursued

**Files**:
- `backend-ts/src/agent/context-builder.service.ts` — `build()` method (~150 lines)

**Corrected framing** (initial review had a false premise):

The initial review claimed `build()` is "called on every LLM turn within the same agent loop." This is wrong. `build()` is called once per user message (line 247), before the `while` loop (line 264). The "O(n × iterations)" performance argument is invalid. The JD loading is also already guarded by `if (anchorId)` at lines 153-155 — not unconditional as initially claimed.

What is real: `build()` mixes data loading (6 DB queries, Promise.all'd), nunjucks template rendering, cross-session context aggregation (`buildCrossSessionContext`), density resolution, and message history reconstruction with decryption. Five concerns in one method.

**If pursued**: the seam is concern separation (testability, locality), not caching. A `ContextDataLoader` interface for the fetch layer makes the render/aggregate logic testable without a database.

**Deferred** until Missing-1 (which overlaps the agent module) is complete.

---

## AA-4 — Extension stores: direct transport coupling

**Strength**: Deferred

`extension/src/lib/runtime.ts` already branches `DEV_MODE` for fetch vs `chrome.runtime` — that is the adapter, expressed as an if-branch. Extracting a `ConversationApi` interface now is anticipatory abstraction. This is a hypothetical seam (one adapter); it becomes a real seam when a second adapter — e.g., a test stub or offline queue — is actually needed.

**Revisit when**: store unit tests independent of `runtime.ts` become a felt need, or offline-queue semantics are required.

---

## Recommended Sequence

| Step | Candidate | Reason |
|------|-----------|--------|
| 1 | **AA-3** TailoringBullet entity | Only candidate that directly upholds a PRD-named product invariant; data integrity risk is load-bearing |
| 2 | **Missing-2** QuinnPromptProvider | Small change; separates PM/copy concern from engineering concern; PRD anticipates iteration |
| 3 | **Missing-1** runAgentLoop split | Highest mixed-concern density; `MessagePersistence` + `AgentEventEmitter` |
| 4 | **AA-1** ToolRegistry | Real but small leverage at 8 tools; revisit at ~15 |
| 5 | **AA-5** Encryption repo-layer encapsulation | Real friction, small footprint, not urgent |
| — | AA-2 | Deferred; re-scope as concern-separation candidate after Missing-1 |
| — | AA-4 | Deferred until second adapter scenario materializes |

---

## Peer Review Notes

Corrections incorporated from peer review (seq-2, author: 0-3.2):
- AA-2: removed false performance premise; `build()` is called once per user message, not per iteration
- AA-1: corrected constructor dep count (17, not 13); corrected tool names
- AA-5: corrected proposed solution from entity hooks (async incompatible) to repository-layer encapsulation
- AA-4: promoted to deferred based on "hypothetical seam" argument
- Added Missing-1 (`runAgentLoop` method split) and Missing-2 (prompt hardcoding) as new candidates
- Revised recommended sequence accordingly
