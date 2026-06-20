# FindWith v0.1 — Core Product Flows & Verification Guide

> **Last updated**: 2026-06-16
> **Audience**: New engineers joining the FindWith team
> **Scope**: 8 core product flows — architecture + end-to-end verification steps

---

## Quick Start: Dev Environment in One Command

```bash
# Clone and install
pnpm install                          # installs all workspace packages

# Start everything
make dev                              # docker up + migrate + seed dev user + backend

# Build extension (in a separate terminal)
pnpm --filter @findwith/extension build

# Verify core flows (automated browser walkthrough)
NO_PROXY=localhost,127.0.0.1 npx tsx scripts/verify-dev-flow.ts
```

**Services after `make dev`:**

| Service       | Port  | Purpose                          |
|---------------|-------|----------------------------------|
| PostgreSQL    | 14600 | Main database                    |
| Redis         | 14601 | BullMQ queues + cache            |
| MinIO         | 14602 | S3-compatible file storage       |
| Mailpit (UI)  | 14605 | Catch-all SMTP (view emails)     |
| Backend API   | 14607 | NestJS — `http://localhost:14607`|
| mock-dom      | 14608 | Fake LinkedIn/Gmail HTML pages   |
| mock-llm      | 14609 | LLM replay server (e2e)          |
| mock-stripe   | 14610 | Stripe API mock                  |
| mock-clerk    | 14611 | Clerk JWT issuer mock            |

**Auth in dev:** The extension reads a JWT from `chrome.storage.local`. The mock-clerk at port 14611 signs JWTs with `POST /sign {sub: userId}`. No real Clerk account needed.

---

## Flow 1: Onboarding (Resume → Profile → Deep Chat)

### What it does

New user uploads a resume. Quinn parses it asynchronously, shows a structured profile summary, then opens a deep-dive conversation to surface achievements not visible on paper.

### Architecture

```
Extension (Onboarding.tsx)
  │
  ├── POST /profile/resume ──────────────────────→ backend stores file in S3
  │                                                BullMQ enqueues RESUME_PARSE
  │
  │   [BullMQ: RESUME_PARSE]
  │   ├── download file from S3
  │   ├── extract text (unpdf / mammoth)
  │   └── LLM: structured JSON (basicInfo, education, workExperience, skills)
  │       └── upsert into profile_profiles, profile_education,
  │               profile_work_experiences, profile_skills
  │
  ├── GET /profile (polls every 1.5s until basicInfo ≠ null, max 60s)
  └── POST /conversations {kind: ONBOARDING}
      GET /conversations/:id/prompt (SSE)
      └── agent loop → mine-shining-point tool
          └── BullMQ: MEMORY_QUEUE → user_goal_memory
```

### Verification Steps

**Automated (e2e):**
```bash
NO_PROXY=localhost,127.0.0.1 pnpm exec playwright test e2e/tests/j01-onboarding.spec.ts
```

**Manual step-by-step:**

1. Load the extension in Chrome (`extension/dist/`), open the side panel
2. Navigate to `chrome-extension://<id>/src/sidepanel/index.html`
3. Inject a dev auth token:
   ```js
   // In Chrome DevTools console (sidepanel page)
   const {token} = await (await fetch('http://localhost:14611/sign', {
     method: 'POST', headers: {'Content-Type':'application/json'},
     body: JSON.stringify({sub:'dev-user-1'})
   })).json();
   await chrome.storage.local.set({token});
   location.reload();
   ```
4. **Expected**: Onboarding screen — "嗨，我是 Quinn" + upload card with `data-testid="upload-resume-btn"`
5. Upload `e2e/fixtures/files/resume-senior-pm.pdf`
6. **Expected**: `data-testid="upload-success"` ("解析中…") appears immediately
7. **Expected within 30s**: `data-testid="profile-summary"` ("简历已解析" badge) appears
8. **Expected within 10s after that**: `data-testid="agent-message"` (Quinn asks first question)

**DB check:**
```sql
-- Run via: docker exec findwith-dev-postgres-1 psql -U findwith -d findwith -c "..."
SELECT "parseStatus" FROM profile_resume_sources WHERE "userId" = 'dev-user-1';
-- Expected: DONE

SELECT "basicInfo"->>'fullName' FROM profile_profiles WHERE "userId" = 'dev-user-1';
-- Expected: name from the resume PDF
```

**Common failure modes:**

| Symptom | Cause | Fix |
|---------|-------|-----|
| `upload-resume-btn` not found | Previous test run left profile data | Run `make dev-seed` to reset |
| `profile-summary` never appears | LLM not configured | Check `OPENAI_BASE_URL` in `.env` |
| "未登录" in header | Token not injected before reload | Inject token, then navigate to canonical URL |

---

## Flow 2: Job Analysis ("Ask Quinn")

### What it does

User visits a LinkedIn job page. A content script injects an "Ask Quinn" button. Clicking it captures the JD, triggers async LLM analysis, and opens the side panel with match scores, company brief, and skill gaps.

### Architecture

```
[LinkedIn page]
cs-linkedin-job.js
  ├── scans DOM for job title, company, description
  ├── onClick → chrome.runtime.sendMessage(JOB_CAPTURE)
  └── chrome.runtime.sendMessage(OPEN_SIDEPANEL)

[Background (bus.ts)]
  ├── POST /jobs/capture → creates jobs_captures + jobs_radar_items (ANALYZED)
  └── chrome.sidePanel.open() + navPort NAVIGATE → /job-analysis?id=...

[BullMQ: JOB_ANALYZE]
  ├── LLM: parse JD → hardSkills[], softSkills[], experience, hiddenSignals
  ├── search_company tool → LLM company brief + risk signals
  └── match_profile → surfaceScore, deepScore, gaps[]

[Sidepanel: JobAnalysis.tsx]
  ├── polls GET /jobs/:id until parsedJd + matchResult present
  ├── renders: Match Scores, Key Gaps, Company, Required Skills
  └── POST /conversations {kind: JOB_ANALYSIS}
      GET /conversations/:id/prompt (SSE) → "Want to apply?"
```

### Verification Steps

**Automated (e2e):**
```bash
NO_PROXY=localhost,127.0.0.1 pnpm exec playwright test e2e/tests/j02-job-analysis.spec.ts
```

**Manual step-by-step:**

1. Start dev environment (`make dev`), ensure mock-dom is running
2. Open Chrome with extension, inject auth token (see Flow 1 step 3)
3. Navigate to `http://localhost:14608/linkedin-job.html`
4. **Expected**: "Ask Quinn" button appears in the job card header (injected by `cs-linkedin-job.js`)
5. Click "Ask Quinn"
6. **Expected**: Side panel activates, shows `data-testid="job-analysis-pending"` ("Analysis in progress...")
7. **Expected within 15s**: `data-testid="job-analysis-complete"` appears with:
   - Match Scores section (surface % / deep %)
   - Key gaps list
   - Company description
   - Required skills chips (green = matched)
8. **Expected within 10s**: `data-testid="agent-message"` — Quinn asks about applying

**API check:**
```bash
TOKEN=$(curl -s -X POST http://localhost:14611/sign \
  -H "Content-Type: application/json" \
  -d '{"sub":"dev-user-1"}' | jq -r .token)

curl -s -H "Authorization: Bearer $TOKEN" \
  http://localhost:14607/api/v1/jobs/radar | jq '.[0] | {id, status}'
# Expected: {"id": "...", "status": "ANALYZED"}
```

**Common failure modes:**

| Symptom | Cause | Fix |
|---------|-------|-----|
| "Ask Quinn" button missing | Content script not loaded | Check manifest `content_scripts` matches the URL pattern |
| Analysis stuck in "pending" | BullMQ job failed | Check backend logs for LLM errors |
| 0% match scores | No profile materials | Complete Flow 1 first |

---

## Flow 3: Resume Tailoring + Export

### What it does

User decides to apply. Quinn drafts a tailored resume from the materials library, highlights gaps, conducts a gap-mining conversation to extract more achievements, then exports as PDF or text.

### Architecture

```
POST /tailoring {baseResumeId, parsedJdId}
  └── BullMQ: TAILORING
       ├── select materials matching JD keywords
       └── LLM: rewrite bullets in JD's language
           └── store in tailoring_bullets (status: PENDING → CONFIRMED)

[Sidepanel: Tailoring.tsx]
  ├── shows match score before/after
  ├── POST /conversations {kind: GAP_MINING} (SSE)
  │   └── Quinn: "your profile is missing X — tell me about..."
  │   └── mine-shining-point tool → new material in DB
  │   └── recompute-match tool → updates matchScoreAfter
  ├── PATCH /tailoring/:id/bullets/:bulletId → user edits inline
  └── Export:
       ├── PDF: POST /tailoring/:id/exports?fmt=pdf
       │         └── pdfkit generates ATS-friendly PDF → browser download
       └── TXT: POST /tailoring/:id/exports → copy to clipboard
```

### Verification Steps

**Automated (e2e):**
```bash
NO_PROXY=localhost,127.0.0.1 pnpm exec playwright test e2e/tests/j03-tailoring.spec.ts
```

**Manual step-by-step:**

1. Complete Flow 1 (need profile) and Flow 2 (need a parsed JD)
2. Get IDs:
   ```bash
   TOKEN=$(curl -s -X POST http://localhost:14611/sign \
     -H "Content-Type: application/json" -d '{"sub":"dev-user-1"}' | jq -r .token)

   BASE_RESUME_ID=$(curl -s -H "Authorization: Bearer $TOKEN" \
     http://localhost:14607/api/v1/profile/base-resumes | jq -r '.[0].id')

   PARSED_JD_ID=$(curl -s -H "Authorization: Bearer $TOKEN" \
     http://localhost:14607/api/v1/jobs/radar | jq -r '.[0].parsedJdId')
   ```
3. Start tailoring:
   ```bash
   TAILORING_ID=$(curl -s -X POST http://localhost:14607/api/v1/tailoring \
     -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" \
     -d "{\"baseResumeId\":\"$BASE_RESUME_ID\",\"parsedJdId\":\"$PARSED_JD_ID\"}" | jq -r .id)
   ```
4. In the side panel, navigate to `/tailoring?id=$TAILORING_ID`
5. **Expected**: `data-testid="tailoring-view"` with match scores
6. **Expected within 20s**: `data-testid="agent-message"` — Quinn starts gap mining
7. **Expected**: `data-testid="bullet-item"` cards render with resume bullets
8. Click `data-testid="export-btn"` → PDF downloads as `resume.pdf`

**PDF check:**
```bash
curl -s -X POST "http://localhost:14607/api/v1/tailoring/$TAILORING_ID/exports?fmt=pdf" \
  -H "Authorization: Bearer $TOKEN" \
  --output /tmp/resume.pdf
file /tmp/resume.pdf
# Expected: /tmp/resume.pdf: PDF document, version 1.x
```

**Common failure modes:**

| Symptom | Cause | Fix |
|---------|-------|-----|
| `tailoring-loading` never clears | BullMQ TAILORING job failed | Check backend logs |
| 422 on export | Bullets still in PENDING state | Confirm or edit all pending bullets |
| PDF is empty | No bullets generated | Ensure profile has `workExperience` data |

---

## Flow 4: Easy Apply Auto-fill

### What it does

After tailoring, Quinn fills a LinkedIn Easy Apply form automatically. The user reviews the plan, clicks "Approve & Fill", Quinn injects values into form fields, then the user clicks Submit on LinkedIn. The submission is then recorded in the radar.

### Architecture

```
[LinkedIn Easy Apply modal open]
cs-linkedin-apply.js
  ├── scans input/textarea/select elements in .jobs-easy-apply-modal
  └── EASY_APPLY_FORM → background (stores tabId)

[Sidepanel: EasyApply.tsx]
  └── POST /apply/plan {radarItemId}
      └── LLM generates field values: [{label, value, source}]

User clicks "Approve & Fill"
  └── PATCH /apply/plan/:id/approve
  └── EASY_APPLY_START_FILL → background
      └── chrome.tabs.sendMessage(tabId, EASY_APPLY_FILL)
          └── cs-linkedin-apply.js fillField()
              ├── matches input by label text
              └── dispatches React-compatible input + change events

User clicks Submit on LinkedIn (user action — product boundary)
  └── cs-linkedin-apply.js detects "Application sent" dialog
  └── EASY_APPLY_SUBMITTED → background → navPort → sidepanel
      └── shows "Record Submission" button

User clicks "Record Submission"
  └── POST /apply/submit {radarItemId}
      └── radar_item.status → APPLIED
```

### Verification Steps

**Manual step-by-step** (no automated e2e — requires real LinkedIn or fixture):

1. Open `http://localhost:14608/easy-apply.html` (mock Easy Apply form)
2. Side panel navigates to `/easy-apply?radarItemId=<id>` (trigger from Flow 2)
3. **Expected**: Fill plan renders with field list
4. Click "Approve & Fill"
5. **Expected**: Form fields on the LinkedIn page are populated
6. Check the console in the LinkedIn tab for fill confirmation
7. Click the Submit button on the form (simulated)
8. **Expected**: Side panel shows "Record Submission" button
9. Click "Record Submission"
10. **Expected**: radar item status → APPLIED

**API check:**
```bash
curl -s -X POST http://localhost:14607/api/v1/apply/plan \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"radarItemId":"<id>"}' | jq '{id, fields: (.fields | length)}'
# Expected: plan with N fields

curl -s -X POST http://localhost:14607/api/v1/apply/submit \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"radarItemId":"<id>"}' | jq .status
# Expected: 201
```

**Common failure modes:**

| Symptom | Cause | Fix |
|---------|-------|-----|
| Form fields not filled | Content script tabId stale | Reload LinkedIn tab, re-open Easy Apply |
| "Approve & Fill" no effect | EASY_APPLY_FORM never received | Ensure content script loaded on the LinkedIn page |
| Fields wrong values | LLM hallucinated | Check `/apply/plan` response, edit values before approving |

---

## Flow 5: Email Follow-up

### What it does

User opens a recruiter email in Gmail. A content script reads the email body, sends it to the backend for classification, and Quinn generates a draft reply. The user copies it and sends from Gmail.

### Architecture

```
[Gmail — user opens an email thread]
cs-gmail.js
  ├── reads: subject, from address, body text from DOM
  └── EMAIL_CAPTURE → background → POST /followup/emails

[Backend]
  └── classify-email tool → LLM: INTERVIEW_INVITE / REJECTION / HR_FOLLOWUP / OFFER
  └── draft-reply tool → LLM: draft text based on email type + context

[Sidepanel: shows draft]
  └── GET /followup/emails — list of captured emails
  └── GET /followup/drafts — list of generated drafts

[FollowupScheduler — cron jobs]
  ├── Every hour (0 * * * *): check +3/+8/+15 day follow-up checkpoints
  ├── Daily 02:00 UTC: clean up stale conversation messages
  ├── Daily 03:00 UTC: process account purge sagas
  └── Daily 04:00 UTC: GDPR archival jobs
```

### Verification Steps

**Automated (e2e):**
```bash
NO_PROXY=localhost,127.0.0.1 pnpm exec playwright test e2e/tests/j05-email-capture.spec.ts
NO_PROXY=localhost,127.0.0.1 pnpm exec playwright test e2e/tests/j11-email-scenarios.spec.ts
```

**Manual API test:**
```bash
TOKEN=$(curl -s -X POST http://localhost:14611/sign \
  -H "Content-Type: application/json" -d '{"sub":"dev-user-1"}' | jq -r .token)

# Capture an interview invite email
curl -s -X POST http://localhost:14607/api/v1/followup/emails \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "subject": "Interview Invitation — Product Manager at Stripe",
    "fromAddr": "recruiter@stripe.com",
    "source": "gmail-web",
    "bodyText": "We would like to invite you to a 30-minute phone screen next Tuesday at 2pm PST."
  }' | jq '{id, kind}'
# Expected: {"id": "...", "kind": "INTERVIEW_INVITE"}

# Get generated draft
curl -s -H "Authorization: Bearer $TOKEN" \
  http://localhost:14607/api/v1/followup/drafts | jq '.[0].text'
# Expected: draft reply text
```

---

## Flow 6: Today's Recommendations (Email Dispatch)

### What it does

Daily at 08:00 UTC, Quinn builds a personalized job list for each active Pro subscriber and sends it as an HTML email. Users can also trigger on-demand and provide feedback.

### Architecture

```
@Cron('0 8 * * *') — RecommendationMailerService
  └── query: billing_subscriptions WHERE state=ACTIVE AND tier≠FREE
  └── for each user:
       ├── buildDailyRecommendations(userId, searchQuery)
       │   ├── SerpAPI google_jobs (if SERPAPI_KEY set) or stub list
       │   └── LLM: rank jobs against user's confirmed materials
       └── MailService.send() → nodemailer → SMTP
           └── HTML email: job cards + links

Manual trigger:
  POST /recommendations/build {query}
  GET  /recommendations
  POST /recommendations/:id/feedback {liked, reason}
  POST /recommendations/:id/click {trackingId, redirectUrl}  ← HMAC signed
```

### Verification Steps

**Automated (e2e):**
```bash
NO_PROXY=localhost,127.0.0.1 pnpm exec playwright test e2e/tests/j08-recommendations.spec.ts
```

**Manual — trigger build and check email:**
```bash
TOKEN=$(curl -s -X POST http://localhost:14611/sign \
  -H "Content-Type: application/json" -d '{"sub":"dev-user-1"}' | jq -r .token)

# Build recommendations
curl -s -X POST http://localhost:14607/api/v1/recommendations/build \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query":"product manager fintech remote"}' | jq '{id, itemCount: (.items|length)}'

# Check email arrived in Mailpit (dev inbox)
curl -s http://localhost:14605/api/v1/messages | jq '.messages[0] | {subject, to: .To[0].Address}'
# Expected: {"subject": "Quinn found N jobs for you today", "to": "dev@findwith.test"}
```

**View emails in browser:** Open `http://localhost:14605` — Mailpit UI shows all dev emails.

**Common failure modes:**

| Symptom | Cause | Fix |
|---------|-------|-----|
| Email not sent | `SMTP_HOST` not set | Add `SMTP_HOST=localhost`, `SMTP_PORT=14604` to `.env` |
| Only stub jobs returned | No `SERPAPI_KEY` | Expected in dev. Set `SERPAPI_KEY=<key>` for real results |
| Mailer skips users | Subscription `tier=FREE` | Use `dev-user-1` (seeded as PRO) |

---

## Flow 7: Radar (Application Tracking)

### What it does

Every analyzed job enters the radar. The user tracks its status through a defined state machine, from analysis through offer acceptance.

### Architecture

```
State machine (valid transitions enforced by backend):
  BROWSED → ANALYZED → TAILORING → APPLIED
                     ↘ DECLINED
  APPLIED → INTERVIEWING → OFFER_RECEIVED
  INTERVIEWING → REJECTED
  OFFER_RECEIVED → OFFER_ACCEPTED / OFFER_REJECTED

PATCH /jobs/:id/radar {status} — validates transition
GET /jobs/radar — returns all items ordered by lastStatusAt DESC

[Sidepanel: Radar.tsx]
  ├── card list with status badge (data-status attribute for test assertions)
  ├── data-item-id="{id}" on each card
  └── Refresh button (data-testid="refresh-btn")
```

### Verification Steps

**Automated (e2e):**
```bash
NO_PROXY=localhost,127.0.0.1 pnpm exec playwright test e2e/tests/j04-radar.spec.ts
```

**Manual status cycle:**
```bash
TOKEN=$(curl -s -X POST http://localhost:14611/sign \
  -H "Content-Type: application/json" -d '{"sub":"dev-user-1"}' | jq -r .token)

RADAR_ID=$(curl -s -H "Authorization: Bearer $TOKEN" \
  http://localhost:14607/api/v1/jobs/radar | jq -r '.[0].id')

# Progress through states
for STATUS in TAILORING APPLIED INTERVIEWING OFFER_RECEIVED OFFER_ACCEPTED; do
  curl -s -X PATCH "http://localhost:14607/api/v1/jobs/$RADAR_ID/radar" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"status\":\"$STATUS\"}" | jq '{id, status}'
done
```

**Invalid transition check:**
```bash
# Try to jump from BROWSED to OFFER_ACCEPTED (invalid)
curl -s -X PATCH "http://localhost:14607/api/v1/jobs/$RADAR_ID/radar" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status":"OFFER_ACCEPTED"}' | jq .statusCode
# Expected: 403 (invalid transition — service throws ForbiddenException)
```

---

## Flow 8: Account & Billing

### What it does

IAM manages user identity and preferences. Billing handles Free → Pro upgrades via Stripe. GDPR supports data export and account deletion with a 7-day grace period.

### Architecture

```
IAM
  GET  /iam/me                    → user info
  GET  /iam/me/entitlements       → quota + tier
  GET  /iam/settings              → {density: BALANCED|ENGAGED|QUIET}
  PATCH /iam/settings             → update density

Billing (routes through Stripe mock in dev)
  GET  /billing/subscription      → {tier, state, periodEnd}
  POST /billing/checkout          → Stripe checkout URL
  POST /billing/portal            → Stripe customer portal URL
  POST /billing/resume            → un-pause a paused subscription

GDPR
  POST /iam/account:export        → JSON attachment with all user data
  DELETE /iam/account             → initiates 7-day deletion saga
  POST /iam/account/cancel-deletion → cancels the saga
```

### Verification Steps

**Automated (e2e):**
```bash
NO_PROXY=localhost,127.0.0.1 pnpm exec playwright test e2e/tests/j07-billing.spec.ts
NO_PROXY=localhost,127.0.0.1 pnpm exec playwright test e2e/tests/j09-gdpr.spec.ts
```

**Manual check:**
```bash
TOKEN=$(curl -s -X POST http://localhost:14611/sign \
  -H "Content-Type: application/json" -d '{"sub":"dev-user-1"}' | jq -r .token)

# Check entitlements (dev-user-1 is PRO, quota limit 999)
curl -s -H "Authorization: Bearer $TOKEN" \
  http://localhost:14607/api/v1/iam/me/entitlements | jq .

# Update companion density
curl -s -X PATCH http://localhost:14607/api/v1/iam/settings \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"density":"QUIET"}' | jq .density
# Expected: "QUIET"

# Export all data
curl -s -X POST http://localhost:14607/api/v1/iam/account:export \
  -H "Authorization: Bearer $TOKEN" | jq 'keys'
# Expected: ["conversations", "materials", "profile", "radar", "user"]
```

---

## Running All Tests at Once

```bash
# Unit tests (no infra needed)
pnpm --filter @findwith/backend run test    # 259 tests
pnpm --filter @findwith/extension test      # 133 tests

# E2E tests (requires docker-compose.e2e.yml)
docker compose -f docker-compose.e2e.yml up -d
pnpm --filter @findwith/backend run build   # must compile first
bash e2e/scripts/build-extension-e2e.sh    # build extension with e2e config

NO_PROXY=localhost,127.0.0.1 pnpm exec playwright test
# Expected: 28 passed

# Automated dev flow verification (uses running dev stack)
NO_PROXY=localhost,127.0.0.1 npx tsx scripts/verify-dev-flow.ts
# Expected: 9 steps passed, screenshots in scripts/screenshots/
```

---

## Key File Locations

```
backend-ts/src/
  contexts/
    profile/          # Flow 1: resume upload, parse, materials
    jobs/             # Flow 2: job capture, JD parse, match
    tailoring/        # Flow 3: resume tailoring, PDF export
    apply/            # Flow 4: Easy Apply fill plan
    followup/         # Flow 5: email capture, draft reply, scheduler
    recommendation/   # Flow 6: job recommendations, email dispatch
    iam/              # Flow 8: user, settings, billing, GDPR
  agent/
    tools/            # LLM tools: mine-shining-point, search-company, etc.
  common/
    mail/             # MailService (nodemailer)
    crypto/           # AES-256-GCM field encryption

extension/src/
  background/
    bus.ts            # All message routing (JOB_CAPTURE, EASY_APPLY_*, etc.)
    auth.ts           # Token bootstrap from chrome.storage
  content-scripts/
    linkedin/
      job-detail.ts   # "Ask Quinn" button injection
      easy-apply.ts   # Form scanning + field filling
    gmail/
      email-reader.ts # Email body capture
  sidepanel/
    routes/
      Onboarding.tsx  # Flow 1 UI
      JobAnalysis.tsx # Flow 2 UI
      Tailoring.tsx   # Flow 3 UI
      EasyApply.tsx   # Flow 4 UI
      Radar.tsx       # Flow 7 UI
    stores/           # Zustand state (conversation, radar, profile)
    lib/
      runtime.ts      # Direct HTTP + SSE to backend (sidepanel path)

e2e/
  tests/              # j01–j11 Playwright specs
  fixtures/
    seed.ts           # E2E DB seed (idempotent)
    dom/              # Fake LinkedIn/Gmail HTML pages
    llm/              # LLM response fixtures for e2e replay
scripts/
  seed-dev.ts         # Dev DB seed (dev-user-1)
  verify-dev-flow.ts  # Browser-driven flow verification with screenshots
```

---

## Environment Variables Cheat Sheet

```bash
# backend-ts/.env — minimum for local dev
DATABASE_URL=postgresql://findwith:findwith_dev@localhost:14600/findwith
REDIS_URL=redis://localhost:14601
S3_BUCKET=findwith-dev
S3_ACCESS_KEY_ID=findwith
S3_SECRET_ACCESS_KEY=findwith_dev
S3_ENDPOINT=http://localhost:14602

# LLM — pick one:
OPENAI_API_KEY=<key>
OPENAI_BASE_URL=https://api.openai.com/v1        # real OpenAI
# or for local dev without real LLM:
OPENAI_BASE_URL=http://localhost:14609/v1        # mock-llm
LLM_PROVIDER=openai
LLM_FALLBACK_PROVIDER=none

# Auth mock
CLERK_SECRET_KEY=mock_clerk_secret_unused_in_dev
CLERK_JWKS_URL=http://localhost:14611/.well-known/jwks.json

# Stripe mock
STRIPE_SECRET_KEY=sk_test_mock_dev_key
STRIPE_WEBHOOK_SECRET=whsec_mock_dev_secret
STRIPE_MOCK_URL=http://localhost:14610

# Email (dev uses Mailpit)
SMTP_HOST=localhost
SMTP_PORT=14604
SMTP_FROM=quinn@findwith.com

# Encryption — generate once per install:
CRYPTO_KEK=<base64 32-byte key>
CRYPTO_DEK_CIPHERTEXT=<base64 nonce+ciphertext>

# Other required
SVIX_SIGNING_SECRET=mock_svix_signing_secret_unused
ADMIN_SECRET=<at-least-32-chars>
CORS_ORIGINS=http://localhost:14606,chrome-extension://your-ext-id
```

---

## Troubleshooting

**Backend won't start:**
```bash
cd backend-ts && pnpm run start:dev 2>&1 | grep "ERROR\|Error\|validation failed"
# Most common: missing env var — run: cat .env | grep -c "=" (should be 20+)
```

**Extension content script not loading:**
```bash
# Check that the dist build has IIFE content scripts (not ESM)
head -1 extension/dist/cs-linkedin-job.js
# Expected: "use strict";
# If it starts with "import{", rebuild: pnpm --filter @findwith/extension build
```

**BullMQ jobs stuck:**
```bash
# Check Redis queue lengths
docker exec findwith-dev-redis-1 redis-cli -p 14601 KEYS "bull:*:waiting" | head -10
# Clear stuck jobs (dev only):
docker exec findwith-dev-redis-1 redis-cli -p 14601 FLUSHDB
```

**e2e tests fail with "Services not ready":**
```bash
# The health checks go through a local HTTP proxy
# Always prefix e2e commands with:
NO_PROXY=localhost,127.0.0.1 no_proxy=localhost,127.0.0.1 <command>
```
