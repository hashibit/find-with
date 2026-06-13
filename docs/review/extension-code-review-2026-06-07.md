# FindWith Extension Code Review Report

**Reviewer:** Claude Code (automated)
**Date:** 2026-06-07
**Branch:** ft_extension
**Commit:** 4f855ee
**Scope:** `extension/src/**/*` (31 source files), `extension/public/manifest.json`, build configs

---

## Summary

The extension is a Chrome MV3 Side Panel app with React 18 + Zustand + Vite. It communicates with a backend API via a background service worker, injects content scripts into LinkedIn/Gmail, and uses SSE for streaming AI responses. The architecture is sound for v0.1, but there are **security vulnerabilities, logic bugs, missing error handling, and dead code** that need attention before shipping.

**Severity counts:** 3 Critical, 5 High, 8 Medium, 6 Low

---

## CRITICAL Issues

### C-1. Gmail content script auto-captures email without explicit user action

**File:** `src/content-scripts/gmail/email-reader.ts:39-58`

The Gmail content script automatically captures email content whenever a user opens an email. The PRD (section 6.2) explicitly states:

> "用户每次主动打开邮件让 Quinn 看" / "Content script 读取页面 DOM 内容"

But the current implementation captures **silently on page load and every DOM mutation** — there's no user action required. This violates the product's core privacy principle ("决策权永远在用户") and could cause Chrome Web Store rejection for excessive data collection.

```ts
// Current: captures automatically on every URL change
const observer = new MutationObserver(() => { checkAndCapture(); });
observer.observe(document.body, { childList: true, subtree: true });
checkAndCapture();
```

**Fix:** Gate the capture behind an explicit user action (e.g., clicking an "Ask Quinn about this email" button injected into the Gmail UI).

### C-2. Stale token returned from `getToken()` in background/auth.ts

**File:** `src/background/auth.ts:9-14`

When a token is about to expire, `getToken()` returns the stale token anyway and relies on "Side Panel will refresh on mount." But:

1. There's no mechanism in the side panel that actually refreshes the token on mount. The badge is set to `!` but no code reads this badge state.
2. The stale token is used for API calls in `handleJobCapture`, `handleEmailCapture`, and `handleApiCall` — these will fail with 401, but the error is silently swallowed and returned as `{ error: text }`.
3. No retry-after-refresh logic exists.

**Impact:** Users will experience silent API failures once their token nears expiry, with no recovery path.

### C-3. Origin check in `onMessageExternal` uses `sender.origin` which is not available in MV3

**File:** `src/background/index.ts:30`

`chrome.runtime.onMessageExternal`'s `sender` object has `sender.origin` only in Chrome 80+. However, the more critical issue is that `sender.origin` returns the origin of the **sending page**, but the origin check compares against hardcoded strings. If `sender.origin` is `undefined` (which can happen in certain edge cases), the check `sender.origin !== 'https://findwith.com'` passes and the message is silently dropped — this is correct security behavior but the error is not logged.

**Actual vulnerability:** The `sender.origin` for `externally_connectable` messages could be spoofed if a subdomain of `findwith.com` is compromised. Consider also validating `sender.url` against a stricter allowlist.

---

## HIGH Issues

### H-1. `runtimeNavBus` creates a duplicate port connection in `useEntitlements`

**File:** `src/sidepanel/App.tsx:83`

`useEntitlements` creates its own `chrome.runtime.connect({ name: 'nav' })` port, but `NavBus` (line 22) already calls `runtimeNavBus` which creates another nav port. Two ports with the same name are now open. This wastes resources and could cause duplicate message handling if both ports receive the same broadcast.

### H-2. Idempotency key in `handleJobCapture` includes today's date — same URL on different days gets different keys

**File:** `src/background/bus.ts:124-126`

```ts
const idempotencyKey = await digestMessage(
  `${payload.sourceUrl}|${new Date().toISOString().slice(0, 10)}`,
);
```

The idempotency key includes today's date, so the same job URL captured on different days produces different keys. This defeats idempotency for the common case of a user revisiting a job listing. If the intent is "one capture per URL per day," this should be documented; if it's "one capture per URL," the date should be removed.

### H-3. Tailoring gap-mining `useEffect` dependency is `tailoring?.id` — will re-trigger on every re-render if tailoring is null

**File:** `src/sidepanel/routes/Tailoring.tsx:58`

```ts
useEffect(() => {
  if (!tailoring || gapMiningTriggered.current) return;
  gapMiningTriggered.current = true;
  // ...
  sendMessage(contextMsg, 'TAILORING');
}, [tailoring?.id]); // ← tailoring?.id is undefined when tailoring is null
```

When `tailoring` is null (loading state), `tailoring?.id` is `undefined`. React compares deps with `Object.is` — `undefined === undefined`, so the effect only runs once. But when tailoring loads and `id` changes from `undefined` to the actual ID, the effect runs again. The `gapMiningTriggered` ref prevents the double-send, but the dependency array is misleading and fragile. Use `[tailoring?.id]` only if you explicitly handle the null→value transition, or use `[tailoring]` with a null check.

### H-4. No manifest.json found in source tree — only in `public/` and build output

**File:** `extension/public/manifest.json`

The manifest is in `public/` which is correct for Vite to copy it to `dist/`. However, the `side_panel.default_path` points to `src/sidepanel/index.html`, but the Vite build outputs to `dist/sidepanel/index.html` (the key in `rollupOptions.input` is `sidepanel`). The path in manifest should be `sidepanel/index.html` (without the `src/` prefix) since Vite strips the directory structure.

**Verify:** Check if the built `dist/manifest.json` has the correct path. If the extension fails to load in Chrome, this is likely why.

### H-5. ConversationView component is duplicated and unused

**File:** `src/sidepanel/components/ConversationView.tsx`

This component duplicates the conversation UI already embedded in `Onboarding.tsx` (lines 254-331). Both expose the same `window.findwithLoadConversation` test hook, and both render identical message bubbles. The `ConversationView` component is never imported or used anywhere in the codebase.

**Impact:** Dead code that will drift from the real implementation. The duplicate test hooks could also cause conflicts if both are mounted.

---

## MEDIUM Issues

### M-1. `handleApiCall` in bus.ts uses `API_V1` prefix, but `bgMsgToRequest` returns paths without the `api/v1` prefix

**File:** `src/background/bus.ts:102`

```ts
const resp = await fetch(`${API_BASE}/${path}`, { ... });
```

where `API_BASE = API_V1 = \`${API_BASE}/api/v1\``. And `bgMsgToRequest` returns paths like `conversations`, `profile`, etc. So the final URL is `{origin}/api/v1/conversations` — this appears correct. However, `handleJobCapture` uses `API_BASE` directly (which is `localhost:14607` without `/api/v1`), so the capture URL is `{origin}/jobs/capture` — missing the `/api/v1` prefix.

**Fix:** Use `API_V1` consistently in `handleJobCapture` and `handleEmailCapture`.

### M-2. LinkedIn Easy Apply content script never actually fills the form

**File:** `src/content-scripts/linkedin/easy-apply.ts`

The content script only **scans** form fields and sends them to the background. There's no code to **fill** the form fields with AI-generated values. The `EASY_APPLY_FORM` message is sent but the background handler just returns `{ received: true }` (bus.ts:73). The actual fill logic is presumably in the `EasyApply.tsx` side panel route, but that route only shows a preview — there's no `chrome.tabs.sendMessage` back to the content script to execute the fill.

**Impact:** The Easy Apply feature is a stub — it can scan fields and show a preview, but cannot actually fill the form.

### M-3. `QuinnIcon` component has `style` prop but `Archive.tsx` uses `variant` prop

**File:** `src/fullscreen/routes/Archive.tsx:65`

```tsx
<QuinnIcon variant="circle" color="var(--accent)" size={16} />
```

But `QuinnIcon` accepts `style`, not `variant`:

```tsx
interface QuinnIconProps {
  style?: 'circle' | 'glyph' | 'block';
  // ...
}
```

**Impact:** TypeScript should catch this, but if type-checking is skipped, the icon renders with default props and the `variant` prop is silently ignored.

### M-4. No error boundary in the React app

**File:** `src/sidepanel/main.tsx`

There's no `ErrorBoundary` wrapping the React app. If any component throws during render, the entire side panel goes blank with no recovery. For a Chrome extension side panel, this is particularly bad because the user can't even reload the panel easily.

### M-5. SSE stream has no reconnection logic

**File:** `src/lib/sse.ts`

If the SSE connection drops (network blip, service worker restart), the stream ends silently. There's no retry mechanism, no exponential backoff, no Last-Event-ID resumption. The `persistEventId` option exists but is never used by any caller.

### M-6. `Radar.tsx` follow-up buttons are non-functional

**File:** `src/sidepanel/routes/Radar.tsx:169-170`

```tsx
<button className="btn">还没</button>
<button className="btn primary">回了，看 Gmail</button>
```

These buttons have no `onClick` handlers. They're purely decorative.

### M-7. `Library.tsx` search input is not debounced

**File:** `src/sidepanel/routes/Library.tsx:257-262`

The `filteredMaterials` computation runs on every keystroke. With a large materials list, this could cause jank. More importantly, the search is entirely client-side — if the materials list grows large, this should be server-side.

### M-8. `dev.html` width is hardcoded to 400px

**File:** `extension/dev.html:22`

```css
width: 400px;
```

Chrome Side Panel width is user-adjustable (default ~400px, range 200-800px). Hardcoding 400px in dev mode doesn't match the production behavior where the side panel fills its container.

---

## LOW Issues

### L-1. Mixed language in UI strings

The UI mixes Chinese and English inconsistently:
- Tab labels: `对话`, `雷达`, `档案` (Chinese)
- Error messages: `"No job selected."`, `"Failed to load analysis"` (English)
- Button text: `"Ask Quinn anything…"` (English placeholder), `"陪伴密度"` (Chinese label)
- Streaming indicator: `"Quinn 正在输入…"` (Chinese)

The PRD targets North American job seekers, so the primary language should be English. Chinese strings should be removed or moved to an i18n system.

### L-2. `alert()` used for user feedback

**Files:** `Tailoring.tsx:187`, `EasyApply.tsx:114`

```ts
alert('Resume text copied to clipboard!');
alert('Application recorded!');
```

Using `alert()` in a Chrome extension side panel is jarring and blocks the UI thread. Replace with inline toast/notification components.

### L-3. Inline styles dominate — no CSS classes for route-specific layouts

`JobAnalysis.tsx`, `Tailoring.tsx`, `EasyApply.tsx` use exclusively inline styles. This makes the code hard to maintain and prevents theming. The `quinn.css` file only defines the shell layout; route components should use CSS classes or CSS modules.

### L-4. `console.log` left in production code

**File:** `src/background/index.ts:50`

```ts
console.log('[FindWith SW] initialized');
```

This is harmless but should be gated behind a dev check.

### L-5. `getToken()` is duplicated in two places

**Files:** `src/background/auth.ts:3` and `src/lib/auth.ts:11`

Two different `getToken()` implementations exist:
- `background/auth.ts`: reads from `chrome.storage.local` with expiry check
- `lib/auth.ts`: reads from `chrome.storage.local` without expiry check

The side panel uses `lib/auth.ts`, the background uses `background/auth.ts`. The expiry logic in the background version is dead code (it returns the stale token anyway).

### L-6. `vitest.config.ts` references `jsdom` but no test files exist

No `*.test.ts` or `*.spec.ts` files were found in the source tree. The test infrastructure is set up but unused.

---

## Architecture Observations

1. **Good:** The `runtime.ts` seam cleanly abstracts `chrome.runtime` for dev mode. This allows running the side panel in a plain Vite dev server.

2. **Good:** Content scripts use shared `dom.ts` and `sanitize.ts` utilities. DOMPurify for XSS prevention is the right choice.

3. **Good:** The `bgMsgToRequest` function is the single source of truth for BgMsg → REST path mapping, reducing duplication.

4. **Concern:** The Zustand stores (`conversation.ts`, `radar.ts`, `profile.ts`) contain significant data transformation logic that duplicates what the backend should return in a normalized format. This is a sign of API contract drift.

5. **Concern:** The polling pattern in `JobAnalysis.tsx` and `Tailoring.tsx` (setInterval every 2s) is a workaround for not having server-push. SSE is already implemented for conversation streaming — the same mechanism could be used for job analysis completion.

6. **Concern:** No manifest.json `permissions` justification for `alarms` and `tabs`. The code doesn't use `chrome.alarms` anywhere, and `tabs` permission is broader than needed (could use `activeTab` alone).

---

## Recommendations (Priority Order)

1. **Fix Gmail auto-capture** (C-1) — privacy violation, Chrome Web Store rejection risk
2. **Fix token refresh** (C-2) — implement actual refresh flow or redirect to website re-auth
3. **Fix manifest `side_panel.default_path`** (H-4) — verify the built output path matches
4. **Implement or stub Easy Apply fill** (M-2) — current code creates false expectations
5. **Remove duplicate ConversationView** (H-5) — dead code
6. **Fix `handleJobCapture` API path** (M-1) — missing `/api/v1` prefix
7. **Add ErrorBoundary** (M-4) — critical for extension UX
8. **Fix QuinnIcon prop name** (M-3) — `variant` → `style`
9. **Wire up Radar follow-up buttons** (M-6) or remove them
10. **Unify language** (L-1) — English-only for NA market
11. **Remove `alarms` permission** — unused, reduces review friction
12. **Add SSE reconnection** (M-5) — resilience for flaky networks

---

## Files Reviewed

```
extension/public/manifest.json
extension/src/background/index.ts
extension/src/background/auth.ts
extension/src/background/bus.ts
extension/src/background/config.ts
extension/src/lib/auth.ts
extension/src/lib/runtime.ts
extension/src/lib/sse.ts
extension/src/lib/api-routes.ts
extension/src/content-scripts/linkedin/job-detail.ts
extension/src/content-scripts/linkedin/easy-apply.ts
extension/src/content-scripts/gmail/email-reader.ts
extension/src/content-scripts/shared/dom.ts
extension/src/content-scripts/shared/sanitize.ts
extension/src/sidepanel/App.tsx
extension/src/sidepanel/main.tsx
extension/src/sidepanel/index.html
extension/src/sidepanel/quinn.css
extension/src/sidepanel/stores/conversation.ts
extension/src/sidepanel/stores/radar.ts
extension/src/sidepanel/stores/profile.ts
extension/src/sidepanel/routes/Onboarding.tsx
extension/src/sidepanel/routes/JobAnalysis.tsx
extension/src/sidepanel/routes/Tailoring.tsx
extension/src/sidepanel/routes/Radar.tsx
extension/src/sidepanel/routes/Library.tsx
extension/src/sidepanel/routes/EasyApply.tsx
extension/src/sidepanel/components/Quinn.tsx
extension/src/sidepanel/components/ConversationView.tsx
extension/src/fullscreen/index.tsx
extension/src/fullscreen/index.html
extension/src/fullscreen/routes/Archive.tsx
extension/vite.config.ts
extension/vite.config.cs.ts
extension/tsconfig.json
extension/eslint.config.js
extension/package.json
extension/dev.html
```
