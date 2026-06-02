# Architecture Review — 2026-06-02

**Scope**: `backend-ts/src/agent/` · `backend-ts/src/contexts/iam/` · `extension/src/background/` · `extension/src/sidepanel/stores/`
**Branch**: `ft_fix_gaps`
**Author**: 0-5.1

---

## Summary

8 friction points. 3 are strong candidates for immediate action (AR-1, AR-2, AR-4). The rest are worth-exploring or speculative.

---

## AR-1 — Cosine similarity duplicated in two places

**Strength**: Strong

**Files**:
- `backend-ts/src/agent/context-builder.service.ts:120` — module-level `function cosineSimilarity(a, b)`
- `backend-ts/src/agent/tools/recompute-match.tool.ts` — private `cosineSimilarity(a, b)` method at end of class

**Problem**: Identical implementations. If the formula changes (e.g., add length guard for mismatched vectors), it must be fixed in both places. Locality failure — the bug surface is split across two unrelated modules.

**Deletion test**: Delete one copy. The complexity (the formula, the edge case for zero-norm) reappears in the caller that lost it. Not shallow — it earns its keep as a shared utility.

**Fix**: Extract to `backend-ts/src/agent/math.ts` or `backend-ts/src/common/math.ts`:
```ts
export function cosineSimilarity(a: number[], b: number[]): number { ... }
```
Both callers import from there. One unit test covers both call sites.

---

## AR-2 — Material loading at 5 independent call sites

**Strength**: Strong

**Files** (all inject `Repository<ProfileMaterial>` directly):
1. `backend-ts/src/agent/context-builder.service.ts:145` — two variants: with-embeddings and without
2. `backend-ts/src/agent/tools/recompute-match.tool.ts:25` — `{ status: 'CONFIRMED' } | { status: 'USER_EDITED' }`
3. `backend-ts/src/agent/tools/farewell.tool.ts:18` — same status filter
4. `backend-ts/src/contexts/recommendation/recommendation.service.ts:32` — same status filter
5. `backend-ts/src/contexts/memory/memory.processor.ts:47` — loads all materials to embed missing ones

**Problem**: The filter `[{ status: 'CONFIRMED' }, { status: 'USER_EDITED' }]` is repeated across at least 3 sites. The semantic ranking (sort by cosine, take TOP_K) happens only in ContextBuilderService — other callers get materials in DB insertion order and don't know they're missing the ranking step. Silent correctness divergence.

**Deletion test**: Delete direct `materialRepo` access from tools and let them call a shared seam. The complexity (status filter, embedding fallback, ranking) concentrates in one place. Strong signal.

**Fix**: A `MaterialReader` service in the profile context or agent subdirectory:
```ts
interface MaterialReader {
  loadForUser(userId: string): Promise<ProfileMaterial[]>;
  loadForMatch(userId: string, jdEmbedding: number[] | null): Promise<ProfileMaterial[]>;
}
```
All 5 callers inject `MaterialReader`, not `Repository<ProfileMaterial>`. The ranking and filter live in one place.

---

## AR-3 — Shallow message bus (extension)

**Strength**: Worth exploring

**File**: `extension/src/background/bus.ts` — 160+ line switch/case

**Problem**: All message types and their HTTP mappings live in a single flat function. Adding a new message type means editing `bus.ts` regardless of which domain the message belongs to. The `BgMsg` union type acts as the interface, but the handler is a monolith — no seam between "how messages are routed" and "what each handler does."

**Deletion test**: Delete `bus.ts`. Each caller (index.ts) would need to replicate the switch plus the `handleApiCall` helper. Moderate complexity — not a pass-through.

**Note**: The current structure works for v0.1 scale. The friction is that the switch is the only test surface for individual handlers, which requires mocking all message types to test one. A handler-per-file pattern with a registry would fix this. Defer to v0.2 unless the bus grows beyond 200 lines.

---

## AR-4 — IAM controller as cross-context GDPR hub

**Strength**: Strong

**File**: `backend-ts/src/contexts/iam/iam.controller.ts:68–86`

**Problem**: `IamController` directly injects 6 repositories from 5 DDD contexts outside IAM:
- `BillingSubscription` (billing)
- `QuotaUsageCounter` (quota)
- `ProfileProfile`, `ProfileMaterial` (profile)
- `JobRadarItem` (jobs)
- `ConvConversation` (conversation)

This is done for two endpoints: `GET /iam/account:export` (GDPR portability) and `GET /iam/me/entitlements`. `AccountPurgeSagaService` already exists as a proper seam for deletion — the export and entitlements endpoints haven't received the same treatment.

**Consequence**: IAM module must register TypeORM entities from 5 foreign contexts. Any schema change in those contexts breaks the IAM module's compilation. The IAM context is not independently deployable.

**Fix**:
- `entitlements`: Move the billing + quota query into `BillingService` (already in IAM) or a dedicated `EntitlementsService`. Remove `billingRepo` and `quotaRepo` direct injection from the controller.
- `account:export`: Create a `DataExportService` that accepts a `userId` and calls each context's own read interface. Each context exposes a `exportForUser(userId): Promise<unknown>` method. IAM orchestrates, contexts own their data shape.

---

## AR-5 — ContextBuilderService: 10 injection points, untestable without all of them

**Strength**: Worth exploring

**File**: `backend-ts/src/agent/context-builder.service.ts:135–156`

**Injections**: 8× `@InjectRepository` + `@Inject(FIELD_CRYPTO)` + `@InjectPinoLogger` = 10 constructor params.

**Problem**: Any test of `build()` must provide all 10 mocks even for paths that only touch 2 repos. The interface (the `build()` function signature) is small; the implementation complexity bleeds into every test.

**Note**: AR-2 fixes materialRepo (removes 1 injection). AR-4 doesn't affect this service. The remaining coupling is structural — ContextBuilder is a legitimate aggregator, so some breadth is expected. The fix here is decomposing into sub-builders (one per context section: profile, materials, conversation history, radar) each independently testable. Worth exploring after AR-2.

---

## AR-6 — Extension stores: untyped backend contract

**Strength**: Worth exploring

**File**: `extension/src/sidepanel/stores/conversation.ts:179–183`

```ts
const messages: ConversationMessage[] = result.messages.map((m: any) => ({
  role: m.role === 'USER' ? 'user' : 'assistant',
  text: m.text || m.payload?.content?.filter(...).map(...).join('') || '',
  timestamp: new Date(m.createdAt).getTime(),
}));
```

**Problem**: `m: any` means the backend response shape is inferred by convention, not enforced. If the backend renames `createdAt` or changes the message structure, this fails silently at runtime with an empty string fallback.

**Fix**: Generate a shared DTO type from the backend (or manually maintain a `ConversationMessageDto` in a shared types package). The extension imports from the shared package. One schema change is caught at compile time on both sides.

**Note**: Requires build plumbing to share types across packages. Pragmatic v0.1 workaround is to add a runtime shape guard (already partially done with the `kind` check after AR-1's code review). Full fix is v0.2 work.

---

## AR-7 — Tool registration: 3-step manual sync

**Strength**: Worth exploring

**File**: `backend-ts/src/agent/agent.service.ts:57–122`

**Problem**: Adding a tool requires 3 coordinated edits:
1. Constructor injection (line ~104–111)
2. `TOOL_SCENES` constant entry (line ~57–66) — which scenes the tool is available in
3. `assertTool` call in toolMap initialisation (line ~115–122)

`TOOL_SCENES` is a disconnected constant keyed by string name. If the tool's `name` property drifts from the key, the tool silently becomes available in all scenes (falls back to `[]` → `includes` always false → included everywhere).

**Fix**: Move scene metadata onto the tool itself:
```ts
interface ToolExecutor {
  name: string;
  scenes: string[];   // add this
  execute(...): Promise<...>;
}
```
`getToolsForScene` filters by `tool.scenes`. `TOOL_SCENES` constant is deleted. Adding a tool is 1 edit (the tool class) + 1 injection.

---

## AR-8 — Background port: double onDisconnect registration

**Strength**: Speculative

**File**: `extension/src/background/index.ts:18–85`

**Problem**: When a `CONVERSATION_PROMPT` message is handled, the port gets two `onDisconnect` listeners:
1. The outer one (line ~18) that removes the port from `connectedPorts` and looks up `conversationPorts`
2. The inner one (line ~74) added after `openSseStream` that checks `entry?.port === port` before aborting

Both fire on disconnect. The outer handler deletes from `conversationPorts` and aborts ctrl. The inner handler then runs, gets `undefined` from the now-deleted map entry, and does nothing. Redundant but not incorrect given the current `entry?.port === port` identity check.

**Fix**: Register a single `onDisconnect` listener that handles both cleanup concerns. Or ensure the outer handler is the only one and it subsumes the inner logic. Low risk to leave as-is since the identity check prevents double-abort.

---

## Priority Order

| # | ID | Action | Effort |
|---|-----|--------|--------|
| 1 | AR-1 | Extract `cosineSimilarity` to shared util | 30 min |
| 2 | AR-2 | Extract `MaterialReader` service | 2–3 h |
| 3 | AR-4 | Move entitlements + export out of IAM controller | 2–3 h |
| 4 | AR-7 | Move scenes onto tool interface, delete TOOL_SCENES | 1 h |
| 5 | AR-3 | Message bus refactor | Defer to v0.2 |
| 6 | AR-5 | ContextBuilder decomposition | After AR-2 |
| 7 | AR-6 | Shared DTO types | v0.2 build plumbing |
| 8 | AR-8 | Double onDisconnect | Leave or fix in passing |

**Top recommendation**: AR-1 + AR-2 together. AR-1 is a 30-minute fix with zero risk. AR-2 eliminates the silent correctness divergence in material ranking across 5 callers — that's a real bug risk, not just aesthetics.
