# Chrome Extension Architecture

> **Last updated**: 2026-06-07
> **Version**: v0.1 (simplified after architecture review)

---

## Overview

FindWith Chrome Extension uses a simplified architecture where the Sidepanel directly communicates with the backend for most operations. The Background Service Worker only handles essential Chrome-specific tasks that cannot be done elsewhere.

---

## Communication Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                         Chrome Extension                               │
├──────────────────────────────────────────────────────────────────────┤
│                                                                        │
│   ┌─────────────────┐                                                 │
│   │    Sidepanel    │                                                 │
│   │  (React/UI)     │                                                 │
│   │                 │                                                 │
│   │  - SSE 直连     │────── SSE ──────────>│  Backend API │           │
│   │  - HTTP 直连    │────── fetch ────────>│  (API_V1)    │           │
│   │  - 读 token     │───── chrome.storage.local            │           │
│   │                 │                                                 │
│   │  useEntitlements│──── fetch /iam/me/entitlements ─────>│           │
│   │  (打开时fetch)   │                                                 │
│   │                 │                                                 │
│   │  runtimeNavBus  │<───── NAVIGATE (port 'nav') ──────   │           │
│   │                 │<───── ENTITLEMENTS_UPDATED ─────────  │           │
│   └─────────────────┘                                                 │
│          │                                                             │
│          │ chrome.runtime.connect({ name: 'nav' })                    │
│          │                                                             │
│   ┌─────────────────┐          ┌──────────────────┐                   │
│   │ Content Script  │          │    Background    │                   │
│   │ (LinkedIn/Gmail)│          │ (Service Worker) │                   │
│   │                 │          │                  │                   │
│   │ JOB_CAPTURE     │──msg───> │ handleMessage()  │                   │
│   │ EMAIL_CAPTURE   │          │ → fetch backend  │                   │
│   │ OPEN_SIDEPANEL  │          │ → chrome.sidePanel.open()            │
│   │ EASY_APPLY_*    │          │ → 广播给 navPorts                    │
│   │                 │          │                  │                   │
│   └─────────────────┘          │ External msgs:   │                   │
│                                │ - AUTH_NONCE     │<── Website         │
│                                │ - AUTH_TOKEN     │<── Website         │
│                                │ - ENTITLEMENTS_  │<── Backend push    │
│                                │   INVALIDATE     │                    │
│                                │                  │                   │
│                                │ handleXxx() in   │                   │
│                                │ auth.ts:         │                   │
│                                │ - handleAuthNonce│                   │
│                                │ - handleAuthToken│                   │
│                                │ - handleEntitle- │                   │
│                                │   mentsInvalidate│                   │
│                                └──────────────────┘                   │
│                                                                        │
└──────────────────────────────────────────────────────────────────────┘
```

---

## File Responsibilities

| File | Responsibility |
|------|---------------|
| **background/index.ts** | Port management, message routing, external message routing (~40 lines) |
| **background/auth.ts** | All handlers: `getToken`, `handleAuthNonce`, `handleAuthToken`, `handleEntitlementsInvalidate`, `initAuth` |
| **background/bus.ts** | Content script message handling: JOB_CAPTURE, EMAIL_CAPTURE, OPEN_SIDEPANEL |
| **background/config.ts** | Configuration: `API_BASE`, `API_V1`, `MOCK_CLERK_URL` |
| **lib/runtime.ts** | Sidepanel seam: direct HTTP/SSE, content script messages via background |
| **lib/auth.ts** | `DEV_MODE` constant, `getToken` (read-only from chrome.storage) |
| **lib/sse.ts** | SSE implementation (fetch + ReadableStream), used by sidepanel |
| **sidepanel/App.tsx** | `useAuthUser`, `useEntitlements` (fetch on mount + listen for push) |

---

## Background Service Worker Responsibilities

The Background is minimal and only handles tasks that **must** be done by a Service Worker:

| Function | Why Background is needed |
|----------|-------------------------|
| **Content script → Backend** | Content scripts don't have token, CORS restrictions |
| **chrome.sidePanel.open()** | Only background can call this (requires windowId) |
| **Nav port broadcast** | Broadcast NAVIGATE, ENTITLEMENTS_UPDATED to all sidepanels |
| **External message (Website)** | Different origin, requires `onMessageExternal` |
| **Token storage** | Centralized chrome.storage management, badge display |

---

## Sidepanel Responsibilities

| Function | Implementation |
|----------|---------------|
| **UI Rendering** | React + Zustand stores |
| **API Calls** | Direct to backend (HTTP/SSE) |
| **Token** | Read from chrome.storage (not involved in auth) |
| **Entitlements** | Fetch on mount + listen for background push |

---

## Authentication Flow

```
Website (findwith.com)
    ↓ User login
Clerk/DevAuth Provider
    ↓ Auth success
Website → chrome.runtime.sendMessage(extensionId, { type: 'AUTH_TOKEN', token })
    ↓
Background handleAuthToken() → Store in chrome.storage
    ↓
Sidepanel getToken() → Read from chrome.storage
```

**Key principle**: Extension does NOT participate in authentication. It only stores and reads the token.

---

## Entitlements Refresh Mechanism

Two mechanisms work together:

| Trigger | Flow |
|---------|------|
| **Sidepanel opens** | `useEntitlements()` → fetch `/iam/me/entitlements` → store in state + chrome.storage |
| **Backend push** | Stripe webhook → Backend → `ENTITLEMENTS_INVALIDATE` → Background → fetch → broadcast to navPorts → Sidepanel receives `ENTITLEMENTS_UPDATED` |

---

## SSE (Server-Sent Events)

Sidepanel can **directly** connect to backend SSE because:

- Sidepanel is a normal extension page (`chrome-extension://xxx/sidepanel.html`)
- Has full DOM API access (EventSource, fetch + ReadableStream)
- No 30-second kill limit (unlike Service Worker)

**Implementation**: `lib/sse.ts` uses `fetch + ReadableStream` (EventSource not available in Service Worker, but sidepanel doesn't need it)

---

## Configuration

All extension configuration is centralized in `background/config.ts`:

```typescript
export const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:14607';
export const API_V1 = `${API_BASE}/api/v1`;
export const MOCK_CLERK_URL = import.meta.env.VITE_MOCK_CLERK_URL ?? 'http://localhost:14611';
```

Environment variables:
- `VITE_API_BASE`: Backend API URL
- `VITE_MOCK_CLERK_URL`: Mock clerk URL (dev only)

---

## Extension ID (Fixed)

The extension ID is fixed via `key` in `manifest.json`:

```json
{
  "key": "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAwXFUMCf2..."
}
```

This allows website to send messages to a known extension ID.

---

## DEV_MODE

`DEV_MODE` is used for **runtime environment**, not auth mode:

| DEV_MODE | Behavior |
|----------|----------|
| `true` (Vite dev server) | Direct fetch/SSE, no chrome.runtime required |
| `false` (packed extension) | Content script messages via chrome.runtime, HTTP/SSE direct |

---

## Simplified Architecture Decisions

| Decision | Before | After | Reason |
|----------|--------|-------|--------|
| **SSE** | Sidepanel → Background → Backend | Sidepanel → Backend (direct) | Sidepanel has DOM API, no need for proxy |
| **HTTP API** | Sidepanel → Background → Backend | Sidepanel → Backend (direct) | Same reason |
| **Entitlements polling** | Alarm every 1 min | ❌ Removed | Changed to fetch on mount + push |
| **Keepalive alarm** | ~25 sec alarm | ❌ Removed | SSE moved to sidepanel, background doesn't need keepalive |
| **Background SSE handling** | conversationPorts, SSE management | ❌ Removed | No longer needed |

---

## Message Types

### BgMsg (internal messages from content scripts / sidepanel)

```typescript
type BgMsg =
  | { type: 'JOB_CAPTURE'; payload: JobCapturePayload }
  | { type: 'EMAIL_CAPTURE'; payload: EmailCapturePayload }
  | { type: 'OPEN_SIDEPANEL'; payload: { route?: string } }
  | { type: 'EASY_APPLY_FORM'; payload: { fields: any[] } }
  | { type: 'EASY_APPLY_SUBMITTED' }
  // ... plus API route messages handled by bgMsgToRequest()
```

### External Messages (from website / backend)

```typescript
type ExternalMsg =
  | { type: 'AUTH_NONCE'; nonce: string }
  | { type: 'AUTH_TOKEN'; token: string; expires_at: number; user_id: string }
  | { type: 'ENTITLEMENTS_INVALIDATE' }
```

---

## Related Documents

- [Chrome Extension Tech Stack](./chrome-extension-tech-stack.md) - Original design document
- [Architecture Review 2026-06-05](../review/architecture-review-2026-06-05.md) - Review that led to simplification