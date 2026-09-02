# Security & Crypto — As-Built Inventory (v0.1)

> Scope: every cryptographic and auth-adjacent mechanism in the system, as actually
> implemented (2026-09). File:line references are accurate as of this date.
> Design intent lives in `v0.1-product-design.md` §12.1; divergences are called out in
> §3 of this document. When you touch any crypto path, update this doc.

## 1. Content encryption — the FieldCrypto envelope system

The only true encryption in the codebase. One interface, two implementations,
three DI providers.

**Interface** — `backend-ts/src/common/crypto/crypto.interface.ts`

```ts
FIELD_CRYPTO  // injection token
encrypt(plaintext: string): Promise<Buffer>  // nonce[12] + ciphertext + tag[16]
decrypt(data: Buffer): Promise<string>
verify(): Promise<void>
```

**Implementations**

| Impl | When | Behavior |
|---|---|---|
| `EnvelopeCryptoService` (`common/crypto/envelope-crypto.service.ts`) | `env === 'production'` | Real AES-256-GCM envelope encryption |
| `EphemeralCryptoService` (`common/crypto/ephemeral-crypto.service.ts`) | everything else (local, test) | Identity mapping — plaintext UTF-8 bytes. "Ciphertext" in local/test DBs IS plaintext |

**Key chain**

```
CRYPTO_KEK            (env, base64 32B — "generate once per install")
  └─ decrypts CRYPTO_DEK_CIPHERTEXT  (env, base64: nonce + ciphertext + tag)
        └─ DEK plaintext lives in memory only; never persisted at runtime
```

- Ciphertext wire format is uniform across all encrypted columns:
  **bytea = nonce[12] + AES-256-GCM ciphertext + authTag[16]**.
- Boot fail-fast: the DI factory (`agent.module.ts:87`) awaits `verify()`, which does a
  round-trip self-test. A misconfigured DEK prevents the process from starting.
- Config validation: `CRYPTO_KEK` / `CRYPTO_DEK_CIPHERTEXT` are required non-empty
  (`config/configuration.ts:38`), surfaced as `crypto.kek` / `crypto.dekCiphertext`.

**DI topology**

`FIELD_CRYPTO` is provided (with identical, triplicated factory logic) in:

- `agent/agent.module.ts:87` — exported to the container as of the conversation-restore fix
- `profile/profile.module.ts:44`
- `followup/followup.module.ts:42`

### 1.1 What KEK and DEK actually are

Both are AES keys; they differ in job, not in kind. **DEK does the work, KEK guards
the DEK.** (DEK = Data Encryption Key, the key that encrypts user data. KEK = Key
Encryption Key, whose only job is to encrypt the DEK.)

```
CRYPTO_KEK               (env var, base64 32B)
    │  AES-256-GCM decrypt
    ▼
CRYPTO_DEK_CIPHERTEXT    (env var, base64)   ← the DEK, as wrapped by the KEK
    │  decryptDek()  (envelope-crypto.service.ts:52)
    ▼
DEK plaintext (32B, process memory only)
    │  used by every encrypt()/decrypt() call
    ▼
column bytea = nonce[12] + ciphertext + tag[16]
```

- **DEK**: the working key. All three encrypted columns are encrypted with it. It
  exists in plaintext only as the `this.dek` instance field of
  `EnvelopeCryptoService` (`envelope-crypto.service.ts:22`) — resolved at boot,
  never persisted to disk, env, or DB.
- **KEK**: touches no user data. Corresponds to `CRYPTO_KEK`. Nothing on disk or in
  the DB ever contains the bare DEK — only the KEK-wrapped form
  (`CRYPTO_DEK_CIPHERTEXT`).

Why not just put the DEK in an env var — what the envelope buys:

1. **Leak isolation.** Env vars are the easiest thing to leak (hosting dashboards,
   log dumps, CI injection). Splitting into two variables on two channels means a
   single leak yields nothing. This is the intent behind §12.1's "KEK via
   Doppler/1Password injection, DEK stored env-wrapped".
2. **Rotation asymmetry.** Rotating the KEK = rewrap the DEK (one env var changes,
   zero data touched). Rotating the DEK = decrypt + re-encrypt every ciphertext in
   every table. The hierarchy exists to make the cheap rotation the frequent one.
3. **Key separation.** The key-guarding key never meets data; the data key never
   leaves memory. Different exposure surfaces.

What the envelope does NOT protect: metadata — roles, timestamps, `conversationId`,
assistant `payload` JSON are all plaintext (see §2 boundaries).

**Honest state of this repo**

- In local `.env` and `.env.test`, KEK and DEK-ciphertext sit side by side — the
  isolation benefit of the envelope is zero in every non-production environment.
  Only production (KEK via Doppler) gets real layering.
- One global DEK for all users, no per-user/tenant keys. Losing the DEK =
  every historical ciphertext is undecryptable, so in practice it never rotates;
  §12.1's "90-day rotation" is documented intent, no tooling exists.
- Non-production uses `EphemeralCryptoService` and never touches this key chain.

## 2. Encrypted vs plaintext columns

### Encrypted columns (all `bytea`)

| Column | Contents | Written by | Read by |
|---|---|---|---|
| `conv_messages.encryptedText` (`message.entity.ts:19`) | Full chat text, USER + ASSISTANT | `agent/conv-message.repository.ts:16` (`saveUser`), `:23` (`saveAssistant`); followup-scheduler nudge (`followup-scheduler.service.ts:106`) | `findRecentForContext` → LLM context; `GET /conversations/:id` display view (`conversation.service.ts:42`) |
| `profile_materials.rawText` (`material.entity.ts:15`) | Raw material text | `profile.service.ts:112` | `listMaterials` decrypts (`profile.service.ts:96`) |
| `followup_emails.bodyText` (`followup-email.entity.ts:19`) | Email body (read off the page by content script — deliberately no Gmail API) | `followup.service.ts:29` | classify-email / draft-reply tools (`classify-email.tool.ts:48`, `draft-reply.tool.ts:54`) |

### Plaintext boundaries — things people forget

| Data | State | Why it matters |
|---|---|---|
| `conv_messages.payload` for ASSISTANT messages | **Plaintext jsonb** | `saveAssistant` writes `encryptedText`, but the full pi-ai message (containing the same text in its content blocks) is stored unencrypted in `payload`. Context building reads `payload` and never decrypts. The encryption boundary is narrower than it looks |
| `conv_messages.payload` for TOOL_RESULT | **Plaintext** | Tool args/results as JSON; may embed profile content |
| `conv_rolling_summaries.content` (`rolling-summary.entity.ts:17`) | **Plaintext** | LLM-written compression summaries |
| `conv_messages.text` | Always `NULL` in DB (by design) | Plaintext exists only transiently: decrypted into the GET response, never written back |
| Non-production databases | No encryption at all | EphemeralCrypto is identity; don't treat local `encryptedText` as sensitive |

**Rule of thumb:** the encryption contract covers three columns (chat text, material
raw text, email body). Everything else in the conversation domain — assistant payload,
tool results, rolling summaries — is plaintext by implementation, outside the
§12.1 promise (which named resume bytes, email body, material.raw_text).

## 3. Design (§12.1) vs implementation

| §12.1 says | As built |
|---|---|
| `pgcrypto` field-level AES-256 via DEK, DB-side | Node **application-layer** AES-256-GCM (`EnvelopeCryptoService`); DB just stores bytea |
| Python `app/startup.py` pop-then-decrypt, `/livez` 500 on missing DEK | TS factory with `verify()` await at module bootstrap (same fail-fast intent, no Python) |
| KEK via Doppler/1Password injection | Both KEK and DEK-ciphertext are plain env vars (accepted v0.1 risk) |
| DEK 90-day manual rotation, KEK semi-annual | Not implemented — rewrap tooling does not exist yet |
| CHECK constraint `length(col) > 16` on encrypted columns | Not present |
| "resume bytes" listed as an encryption target | Resume bytes live in S3/MinIO (`profile_resume_sources.blobUri`), unencrypted at rest — presigned-URL access only |

Fossil comments to ignore: `envelope-crypto.service.ts:16` ("matches the Python
crypto.py implementation") — the Python backend no longer exists.
`contexts/conversation/conv-message.service.ts` was a dead-code hazard (zero imports,
never registered in any module, "AES-256-CBC" that was actually repeating-key XOR
while also writing plaintext into `text`) — removed from the working tree on
2026-09-02; it survives only in git history (`2aae018`). Never resurrect it.

## 4. Sessions & authentication

- **Clerk JWT** — `adapters/auth/clerk-auth.adapter.ts`: jose `createRemoteJWKSet`,
  RS256 `jwtVerify`, `sub` claim = userId.
- **Extension session token** — `iam.controller.ts:114` (`auth/exchange`, nonce path)
  and `:165` (`auth/verify`, Clerk-token path):
  - token = `randomBytes(32)` hex, CSPRNG, 32 bytes of entropy.
  - Redis key `session:<token> → userId`, TTL with sliding renewal
    (`common/guards/user-auth.guard.ts:47` re-sets expire on every successful check).
  - **Not hashed, on purpose**: the in-code comment originally claimed "hashed
    token"; corrected (2026-09) to state the raw-token reality. A Redis read leak
    = session takeover. Accepted for v0.1; if revisited, hash on both write and
    guard-lookup.
- **OAuth nonce** — `contexts/iam/services/nonce.store.ts`: Redis `nonce:<n>`, 5 min TTL,
  `GETDEL` atomic single-use consumption (replay-safe under concurrency).
- **Extension side** — token stored plaintext in `chrome.storage.local`
  (`extension/src/lib/auth.ts`); sidepanel only reads. The extension itself does no
  content encryption; all requests are `Authorization: Bearer <token>`.

## 5. Integrity & signing (forgery resistance, not encryption)

| Mechanism | Where | Notes |
|---|---|---|
| Recommendation click trackingId | `recommendation.service.ts:37-38` `HMAC-SHA256(secret, userId+recoId+dayBucket)` | **Reuses `CRYPTO_KEK` as the HMAC secret** (documented in-code). Public email-click redirect has no auth; the HMAC is the only forgery defense. Key separation purists would object; fine for v0.1, revisit when adding a second HMAC consumer |
| Stripe webhook | `infra.controller.ts:111` `webhooks.constructEvent(rawBody, sig, webhookSecret)` | Requires raw body passthrough (`rawBody: true` in bootstrap); Redis dedup on event id |
| Clerk (svix) webhook | `infra.controller.ts:64` `new Webhook(SVIX_SIGNING_SECRET)` | Same dedup pattern |
| Admin routes | `admin/admin.guard.ts:40` `timingSafeEqual` with length-padded buffers | Length-leak avoided; failures recorded as `admin.auth.failure` telemetry |

## 6. Hashing (non-security)

- Extension `background/bus.ts:207`: SHA-256 of `${sourceUrl}\|${date}` → job capture
  `Idempotency-Key`.
- `profile.service.ts:78`: `randomBytes(8)` hex etag — concurrency token, not a secret.

## 7. Invariants when adding a new encrypted field

1. Entity column: `type: 'bytea', nullable: true` — never `text`.
2. Write path: encrypt via injected `FieldCrypto`; do not also store plaintext
   (the `ConvMessageService` precedent is the counterexample).
3. Read path: decrypt at exactly one service boundary; keep tooling that reads the
   table for non-display purposes on the same decryption utility.
4. If the field feeds the LLM context builder, it must decrypt in
   `ConvMessageRepository.findRecentForContext` or its equivalent.
5. If the field surfaces in a REST response, decrypt in the service layer and strip
   the ciphertext column from the payload (see `conversation.service.ts` `findOne`).
6. Add the column to the table in §2 above.
