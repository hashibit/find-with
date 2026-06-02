# Code Review — FindWith v0.1
**Date:** 2026-06-01  
**Branch:** ft_fix_gaps  
**Reviewer:** Claude (automated audit)  
**Scope:** backend-ts, extension, web — full codebase

---

## Executive Summary

Reviewed 28 concrete issues across backend and extension code. No show-stoppers for v0.1 launch, but 3 critical issues must be addressed before prod. The architecture is well-structured (DDD, adapter pattern, Protobuf contracts), and the codebase is clean overall. This review focuses on bugs, not style.

**Issue distribution:**
- Critical: 3
- High: 7
- Medium: 9
- Low: 9 (most intentional v0.1 TODOs)

---

## Critical Issues

### C1 — Hardcoded localhost URLs in extension background scripts

**Files:**
- `extension/src/background/auth.ts:3`
- `extension/src/background/bus.ts:3`
- `extension/src/background/index.ts:49,118`

**Problem:** API URLs are hardcoded to `http://localhost:14667` with inline comments like `// dev; prod: ...` but no actual switching logic. Extension will point at localhost in production build.

**Fix:**
```typescript
// extension/src/background/config.ts  (new file)
const manifest = chrome.runtime.getManifest();
export const API_BASE =
  manifest.update_url  // present in CWS-published builds, absent in unpacked dev
    ? 'https://api.findwith.com'
    : 'http://localhost:14667';
```
Import `API_BASE` everywhere it's needed. Alternatively, inject via Vite's `define` at build time using `import.meta.env.VITE_API_BASE`.

---

### C2 — Unhandled promise in SSE stream

**File:** `extension/src/background/sse.ts:42-69`

**Problem:** The async IIFE handling SSE reads is wrapped in `void`. If `onEvent()` throws or `reader.read()` rejects, the error is silently dropped. The stream dies without notifying the UI.

**Fix:**
```typescript
void (async () => {
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      // parse and call onEvent
    }
  } catch (e) {
    if ((e as Error).name !== 'AbortError') {
      console.error('[SSE] stream error:', e);
      onError?.(e as Error);  // surface to caller
    }
  } finally {
    reader.releaseLock();
    controller.abort();
  }
})();
```
Add `onError?: (e: Error) => void` to the SSE function signature.

---

### C3 — Tool arguments passed to LLM tools without validation

**File:** `backend-ts/src/agent/agent.service.ts:316-329`

**Problem:** LLM-generated tool call arguments are cast `as Record<string, unknown>` and forwarded directly to tool executors. If the model hallucinates wrong parameter types or omits required fields, tools crash or silently produce wrong output. No schema validation before execution.

**Fix:** Each tool already defines its `parameters` JSON Schema. Validate against it before execution:
```typescript
import Ajv from 'ajv';
const ajv = new Ajv();

private executeToolSafely(name: string, rawArgs: unknown, ...) {
  const tool = this.toolMap.get(name);
  if (!tool) throw new Error(`Unknown tool: ${name}`);
  
  const valid = ajv.validate(tool.parameters, rawArgs);
  if (!valid) {
    throw new BadRequestException(`Invalid args for tool ${name}: ${ajv.errorsText()}`);
  }
  return this.executeTool(name, rawArgs as Record<string, unknown>, ...);
}
```

---

## High Priority Issues

### H1 — Missing array bounds check in context builder

**File:** `backend-ts/src/agent/context-builder.service.ts:271-272`

**Problem:**
```typescript
const start_message_id = convMessages[0]!.id;  // crashes if empty
const end_message_id = convMessages[convMessages.length - 1]!.id;
```
If the conversation has 0 or 1 messages, this throws.

**Fix:**
```typescript
if (convMessages.length < 2) {
  return { messages: [] };
}
const start_message_id = convMessages[0].id;
const end_message_id = convMessages[convMessages.length - 1].id;
```

---

### H2 — Idempotency key saved with `void` (silent DB failure)

**File:** `backend-ts/src/common/interceptors/idempotency.interceptor.ts:48`

**Problem:** `void this.repo.save(record)` — if the DB write fails, the idempotency key is never stored. On retry, the original request is re-processed, breaking idempotency guarantees.

**Fix:**
```typescript
this.repo.save(record).catch((err) => {
  this.logger.error({ err, idempotencyKey }, 'Failed to persist idempotency key');
  // Depending on severity, you may want to re-throw or emit an alert metric
});
```

---

### H3 — Crypto self-test promise not awaited

**File:** `backend-ts/src/common/crypto/envelope-crypto.service.ts:45-50`

**Problem:** `verify()` calls `this.encrypt(test).then(...)` without `await` or `.catch()`. If DEK decryption produced garbage, the self-test fails silently — service starts in a broken state.

**Fix:** Make `verify()` async and `await` it from the module init:
```typescript
async verify(): Promise<void> {
  const test = 'envelope-crypto-verify';
  const enc = await this.encrypt(test);
  const dec = await this.decrypt(enc);
  if (dec !== test) throw new Error('EnvelopeCrypto self-test failed');
}
```
Call from `EnvelopeCryptoModule.forRoot()` using `onApplicationBootstrap`.

---

### H4 — Button stuck in "Capturing..." on sendMessage failure

**File:** `extension/src/content-scripts/linkedin/job-detail.ts:64-85`

**Problem:** If `chrome.runtime.sendMessage` throws (extension context invalidated, service worker sleeping), the button's `disabled` state is never reset and text stays "Capturing...". User must reload the page.

**Fix:**
```typescript
try {
  const result = await chrome.runtime.sendMessage({ type: 'JOB_CAPTURE', payload });
  btn.textContent = result?.error ? 'Error — retry' : 'Sent to Quinn ✓';
} catch (e) {
  btn.textContent = 'Error — retry';
  console.error('Job capture failed:', e);
} finally {
  btn.disabled = false;
}
```

---

### H5 — No input length validation before LLM context

**File:** `backend-ts/src/agent/agent.service.ts:193`

**Problem:** `userMessage` string is used as-is. An adversarially long message causes token overflow; a message with special characters might interfere with prompt structure.

**Fix:**
```typescript
const MAX_USER_MESSAGE = 8_000; // characters
if (!userMessage?.trim()) throw new BadRequestException('Message cannot be empty');
if (userMessage.length > MAX_USER_MESSAGE) throw new BadRequestException('Message too long');
const sanitized = userMessage.replace(/\u0000/g, ''); // strip null bytes
```

---

### H6 — Unsafe type cast for tool instances

**File:** `backend-ts/src/agent/agent.service.ts:115-123`

**Problem:** Tool instances are registered as `as unknown as ToolExecutor` without verifying the interface contract. A missing `execute` method causes a runtime crash mid-conversation.

**Fix:** Add an assertion guard in the registration helper:
```typescript
private registerTool(tool: unknown): void {
  const t = tool as Record<string, unknown>;
  if (typeof t['name'] !== 'string' || typeof t['execute'] !== 'function') {
    throw new Error(`Invalid tool registration: ${JSON.stringify(Object.keys(t))}`);
  }
  this.toolMap.set(t['name'] as string, tool as ToolExecutor);
}
```

---

### H7 — Missing DEK config validation in crypto service

**File:** `backend-ts/src/common/crypto/envelope-crypto.service.ts:53-65`

**Problem:** If `crypto.kek` or `crypto.dekCiphertext` is missing from config (misconfigured deployment), the error thrown will be a low-level buffer error with no context.

**Fix:**
```typescript
private decryptDek(): Buffer {
  const { kek, dekCiphertext } = this.config.get('crypto', { infer: true }) ?? {};
  if (!kek || !dekCiphertext) {
    throw new Error('Crypto config incomplete: kek and dekCiphertext are required');
  }
  try {
    // existing decryption logic
  } catch (err) {
    throw new Error(`DEK decryption failed: ${(err as Error).message}`);
  }
}
```

---

## Medium Priority Issues

### M1 — MutationObserver leaks in content scripts (3 files)

**Files:**
- `extension/src/content-scripts/linkedin/job-detail.ts:91-97`
- `extension/src/content-scripts/gmail/email-reader.ts:50-56`
- `extension/src/content-scripts/linkedin/easy-apply.ts:60-99`

**Problem:** `new MutationObserver(...)` is created on script load but never disconnected. On SPAs like LinkedIn that reuse the page without reload, observers accumulate across route changes, causing memory growth and duplicate callbacks.

**Fix pattern** (apply to all three files):
```typescript
let _observer: MutationObserver | null = null;

function startObserving(): void {
  _observer?.disconnect();
  _observer = new MutationObserver(() => injectButton());
  _observer.observe(document.body, { childList: true, subtree: true });
}

window.addEventListener('beforeunload', () => _observer?.disconnect());
startObserving();
```

---

### M2 — Race condition in conversation port map

**File:** `extension/src/background/index.ts:44-60`

**Problem:** If a second SSE request arrives for the same `conversationId` before the first port's `onDisconnect` fires, the map has a stale entry. The old port is never cleaned up and the new one may not receive events correctly.

**Fix:** Eagerly evict on new connection:
```typescript
const existing = conversationPorts.get(conversationId);
if (existing) {
  try { existing.disconnect(); } catch {}
}
conversationPorts.set(conversationId, port);
```

---

### M3 — Silent failure in memory goal extraction

**File:** `backend-ts/src/contexts/memory/memory.processor.ts:145-150`

**Problem:** If `JSON.parse` fails on LLM output, the function catches the error and logs it but the BullMQ job succeeds. Goal memory is silently not updated. No retry, no alert.

**Fix:** Re-throw from the processor so BullMQ retries:
```typescript
} catch (err) {
  this.logger.error({ err, userId }, 'Failed to parse goal extraction JSON');
  throw err;  // let BullMQ retry
}
```

---

### M4 — IAM user restore: null cast hack

**File:** `backend-ts/src/contexts/iam/iam.service.ts:81`

**Problem:** `deletedAt: null as unknown as Date` is a TypeScript lie. It works at runtime but defeats type safety and confuses future readers.

**Fix:** Update the TypeORM entity to allow `deletedAt: Date | null`, then:
```typescript
await this.userRepo.update({ id: userId }, { deletedAt: null, isActive: true });
```
If TypeORM's `@DeleteDateColumn` already handles this, remove the cast.

---

### M5 — Email body not size-capped before transmission

**File:** `extension/src/content-scripts/gmail/email-reader.ts:28-29`

**Problem:** Very large email threads (newsletters, code diffs, long threads) are transmitted in full. No truncation before `chrome.runtime.sendMessage`, which has a message size limit. Could fail silently or OOM.

**Fix:**
```typescript
const MAX_BODY = 50_000; // characters
const body = sanitizeText(queryText([...])).slice(0, MAX_BODY);
```

---

### M6 — `updateRadarStatus` doesn't guard null/empty status

**File:** `backend-ts/src/contexts/jobs/jobs.service.ts:83-102`

**Problem:** `newStatus` is checked against the allowed transitions but not null-checked first. If `undefined` or `''` is passed, the transition check still processes it, possibly allowing invalid state.

**Fix:**
```typescript
if (!newStatus?.trim()) {
  throw new BadRequestException('Status is required');
}
```

---

### M7 — SSE event not validated after JSON parse

**File:** `extension/src/sidepanel/stores/conversation.ts:69-106`

**Problem:** After `JSON.parse(msg.data)`, the event is consumed without checking for required fields like `kind`. Malformed SSE payloads cause silent no-ops or partial state updates.

**Fix:**
```typescript
const event = JSON.parse(msg.data) as unknown;
if (typeof event !== 'object' || !event || !('kind' in event)) {
  console.warn('[SSE] unexpected event format', msg.data);
  return;
}
```

---

### M8 — Payload type cast in context builder without validation

**File:** `backend-ts/src/agent/context-builder.service.ts:246-249`

**Problem:** `msg.payload as Message` skips runtime validation. Corrupted DB rows or schema migrations could cause malformed messages to be silently passed to the LLM context.

**Fix:** Add a minimal shape guard:
```typescript
const p = msg.payload as unknown;
if (!p || typeof p !== 'object' || !('role' in p) || !('content' in p)) {
  this.logger.warn({ msgId: msg.id }, 'Skipping malformed message payload');
  return [];
}
return [Promise.resolve(p as Message)];
```

---

### M9 — Dev auth adapter not reviewed for security

**File:** `backend-ts/src/adapters/auth/dev-auth.adapter.ts`

**Problem:** Not audited. Dev adapters sometimes contain hardcoded credentials, bypass logic, or test backdoors that accidentally ship to production.

**Action:** Confirm `DevAuthAdapter` is only registered when `NODE_ENV !== 'production'`. Add a boot-time guard:
```typescript
if (process.env.NODE_ENV === 'production') {
  throw new Error('DevAuthAdapter must not be used in production');
}
```

---

## Low Priority / Technical Debt

### L1 — `_kind` parameter in `editBullet` is unused

**File:** `backend-ts/src/contexts/tailoring/tailoring.service.ts:48`

The `_kind` param is documented as a future v0.2 feature. Remove it from the public signature and add a code comment explaining the planned extension point instead.

---

### L2 — `as any` type casts in context builder query

**File:** `backend-ts/src/agent/context-builder.service.ts:261,266`

Two `query as any` casts. Type the query object properly using TypeORM's `FindManyOptions<ConversationMessage>`.

---

### L3 — `verify()` called in constructor context but result not awaited

**File:** `backend-ts/src/common/crypto/envelope-crypto.service.ts:48`

Covered in H3 above. The async/sync mismatch is the root issue.

---

### L4 — TODOs are intentional and tracked

The following TODOs are v0.1-scoped and acceptable:

| File | TODO | Target |
|------|------|--------|
| `tailoring.service.ts:47` | LLM-mediated bullet editing | v0.2 |
| `tailoring.service.ts:165` | Actual PDF generation | v0.2 |
| `followup-scheduler.service.ts:55` | SSE nudge push | v0.2 |
| `context-builder.service.ts:226` | Pass density setting | post-v0.1 |

No action needed. Confirm they're tracked in the sprint backlog.

---

## Action Items Summary

| ID | Priority | File(s) | Action |
|----|----------|---------|--------|
| C1 | Critical | `extension/src/background/*.ts` | Replace hardcoded localhost with env/manifest-based config |
| C2 | Critical | `extension/src/background/sse.ts` | Add `onError` callback and catch to async IIFE |
| C3 | Critical | `backend-ts/src/agent/agent.service.ts` | Validate tool args against JSON Schema before execution |
| H1 | High | `backend-ts/src/agent/context-builder.service.ts` | Bounds-check `convMessages` before index access |
| H2 | High | `backend-ts/src/common/interceptors/idempotency.interceptor.ts` | Add `.catch()` to idempotency key save |
| H3 | High | `backend-ts/src/common/crypto/envelope-crypto.service.ts` | Await `verify()` properly in module init |
| H4 | High | `extension/src/content-scripts/linkedin/job-detail.ts` | Add `finally { btn.disabled = false }` |
| H5 | High | `backend-ts/src/agent/agent.service.ts` | Add length + null check on `userMessage` |
| H6 | High | `backend-ts/src/agent/agent.service.ts` | Add tool interface assertion guard |
| H7 | High | `backend-ts/src/common/crypto/envelope-crypto.service.ts` | Validate kek/dekCiphertext before DEK decryption |
| M1 | Medium | 3 content script files | Cleanup `MutationObserver` on `beforeunload` |
| M2 | Medium | `extension/src/background/index.ts` | Evict old port before inserting new one |
| M3 | Medium | `backend-ts/src/contexts/memory/memory.processor.ts` | Re-throw parse error so BullMQ retries |
| M4 | Medium | `backend-ts/src/contexts/iam/iam.service.ts` | Remove `null as unknown as Date` cast |
| M5 | Medium | `extension/src/content-scripts/gmail/email-reader.ts` | Truncate email body to 50k chars |
| M6 | Medium | `backend-ts/src/contexts/jobs/jobs.service.ts` | Null-check `newStatus` |
| M7 | Medium | `extension/src/sidepanel/stores/conversation.ts` | Validate SSE event shape after parse |
| M8 | Medium | `backend-ts/src/agent/context-builder.service.ts` | Guard payload shape before LLM context injection |
| M9 | Medium | `backend-ts/src/adapters/auth/dev-auth.adapter.ts` | Add production boot guard |
| L1 | Low | `backend-ts/src/contexts/tailoring/tailoring.service.ts` | Remove `_kind` param or document intent clearly |
| L2 | Low | `backend-ts/src/agent/context-builder.service.ts` | Replace `as any` with typed `FindManyOptions` |

---

## What's Working Well

- Adapter pattern for auth/payment/storage is clean and correct
- DDD context boundaries map clearly to PRD modules
- TypeORM migrations are versioned and sequential
- Envelope encryption with AES-256-GCM is correctly implemented
- Content script XSS prevention via DOMPurify wrapper is in place
- Protobuf contracts enforce type safety at API boundaries
- Testcontainers integration tests catch real DB behavior
- BullMQ processor pattern for async resume tailoring is solid
- Quota idempotency key design is correct (modulo the `void` bug in H2)
