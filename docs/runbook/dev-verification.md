# Development Environment Verification

This runbook covers the full dev verification flow after setup or reset. The emphasis is on **browser-based verification** — API checks alone are insufficient. Many issues (auth guards, React state, routing, UI rendering) only surface in the browser.

Each section lists both a browser check (primary) and API check (supporting). Do not skip the browser checks.

## Prerequisites

- Dev infrastructure running (`make up`)
- Backend running (`cd backend-ts && pnpm run start:dev`)
- Extension dev server running (`pnpm ext:dev` or `cd extension && pnpm dev:web`)
- Web dev server running (`pnpm web:dev` or `cd web && pnpm dev`)
- All services healthy (see Step 1)
- Real LLM API configured in `backend-ts/.env` (Anthropic or OpenAI key)

---

## Step 1 — Infrastructure Health

```bash
# Backend: db + redis + llm must all be "ok"
curl -s http://localhost:14607/health | jq
# Expected: {"status":"ok","checks":{"db":"ok","redis":"ok","llm":"ok"}}

# Mock services
curl -s http://localhost:14610/health   # mock-stripe → {"ok":true}
curl -s http://localhost:14611/health   # mock-clerk  → {"ok":true}

# Redis (internal port 14601, NOT 6379)
redis-cli -p 14601 PING
# Expected: PONG

# PostgreSQL
docker exec findwith-dev-postgres-1 pg_isready -p 14600 -U findwith

# All containers healthy (STATUS column must say "healthy", not "starting")
docker compose -f docker-compose.dev.yml ps
```

---

## Step 2 — Auth Flow Verification

### 2.1 API: Mint and verify session token

```bash
# Request JWT from mock-clerk
JWT=$(curl -s -X POST http://localhost:14611/sign \
  -H 'content-type: application/json' \
  -d '{"sub":"user_dev_001","email":"dev@findwith.local"}' | jq -r .token)

echo "JWT: $JWT"

# Exchange for session token — clerkToken in JSON body, NOT Authorization header
RESPONSE=$(curl -s -X POST http://localhost:14607/api/v1/iam/auth/verify \
  -H "content-type: application/json" \
  -d "{\"clerkToken\": \"$JWT\"}")

TOKEN=$(echo $RESPONSE | jq -r .token)
USER_ID=$(echo $RESPONSE | jq -r .user_id)

echo "Session Token: $TOKEN"
echo "User ID: $USER_ID"

# Verify token stored in Redis (internal port 14601)
docker exec findwith-dev-redis-1 redis-cli -p 14601 GET "session:$TOKEN"
# Expected: user_dev_001

# Verify protected endpoint
curl -s http://localhost:14607/api/v1/iam/me \
  -H "authorization: Bearer $TOKEN" | jq
```

### 2.2 Browser: Web login from scratch

> **Do this in browser, not just API.**

1. Open `http://localhost:14606`
2. Click "Log in" in the top nav
3. You should see `http://localhost:14606/login` with "Sign in (Dev Mode)" heading
4. Form is pre-filled with `dev@findwith.local` / `password`
5. Click "Sign in" → should redirect to `http://localhost:14606/dashboard`
6. Dashboard shows: Stats cards ("Jobs tracked", "Analyses this month", "Applications sent"), "Install the FindWith extension" prompt

**Sign out and re-login test:**

7. Click "Sign out" in the top nav
8. Should redirect to homepage (not stuck on dashboard)
9. Navigate back to `http://localhost:14606/login` and sign in again
10. Dashboard should load without error

**Account page test:**

11. Navigate to `http://localhost:14606/dashboard/account`
12. Should show Profile (email, name) and Subscription sections without redirecting to /login
13. If it immediately redirects to /login, the `isLoaded` guard is missing (see Common Issues)

### 2.3 Browser: Extension auth bootstrap

> **Do this in browser.**

1. Open `http://localhost:14612` (extension side panel dev server)
2. It should auto-redirect to `http://localhost:14612/onboarding`
3. Open browser DevTools → Application → Local Storage → `http://localhost:14612`
4. A key `findwith_token` (or similar) should be present after a few seconds
5. If missing, check the browser console for auth errors

---

## Step 3 — Resume Upload & Parsing

### 3.1 Browser: Upload resume via extension onboarding

> **Primary verification path. Do this in browser.**

1. Open `http://localhost:14612/onboarding`
2. You should see Quinn's intro and an "Upload resume" button (or file picker)
3. Create a test resume file:

```bash
cat > /tmp/test-resume.txt << 'EOF'
John Doe
Software Engineer | john@example.com | linkedin.com/in/johndoe

Experience:
- Senior Engineer at Stripe (2022-2024)
  - Built payment processing system handling 10M+ transactions
  - Led team of 5 engineers, reducing on-call incidents by 40%

- Product Engineer at Linear (2024-present)
  - Owned end-to-end feature delivery for collaboration tools
  - Reduced load time by 30% through architecture refactor

Education:
- UCLA, Computer Science, BS, 2018-2022, GPA 3.8

Skills:
- TypeScript, Python, React, Node.js, PostgreSQL
- System design, cross-functional leadership
EOF
```

4. Upload the file through the extension UI
5. After upload, Quinn should acknowledge receipt and show parsing in progress
6. Wait ~30 seconds for the LLM to parse (real LLM call)
7. Navigate to `http://localhost:14612/library` → verify profile data appears

### 3.2 API: Alternative upload and parse check

```bash
# Upload via API (sets up $TOKEN from Step 2.1)
UPLOAD_RESPONSE=$(curl -s -X POST http://localhost:14607/api/v1/profile/resume \
  -H "authorization: Bearer $TOKEN" \
  -F "file=@/tmp/test-resume.txt;type=text/plain")

echo "$UPLOAD_RESPONSE" | jq
SOURCE_ID=$(echo "$UPLOAD_RESPONSE" | jq -r .id)

# Wait for parsing
sleep 30

# Verify parse result
curl -s http://localhost:14607/api/v1/profile \
  -H "authorization: Bearer $TOKEN" | jq '{basicInfo, workExperience, education, skills}'
# Expected: structured data extracted from the resume

# Check parse status
curl -s http://localhost:14607/api/v1/profile/resume-sources \
  -H "authorization: Bearer $TOKEN" | jq '.[0].parseStatus'
# Expected: "DONE"
```

---

## Step 4 — Profile & Materials

### 4.1 Browser: Extension Library view

> **Primary verification path. Do this in browser.**

1. Open `http://localhost:14612/library`
2. You should see two tabs: "Resumes" and "Shining moments" (or similar)
3. **Resumes tab**: shows base resumes (empty if none created yet)
4. **Shining moments tab**: shows materials grouped by tags, with status badges
5. After uploading a resume (Step 3), materials extracted by the parse job should appear here
6. Each material card should show: the text, status (PROPOSED/CONFIRMED), and tags

### 4.2 API: Create and manage materials

```bash
# Create a material manually
MATERIAL_RESPONSE=$(curl -s -X POST http://localhost:14607/api/v1/profile/materials \
  -H "authorization: Bearer $TOKEN" \
  -H "content-type: application/json" \
  -d '{
    "rawText":"I led a product redesign at Stripe that improved conversion by 18%",
    "provenanceKind":"CONVERSATION"
  }')

echo "$MATERIAL_RESPONSE" | jq '{id, status, shiningText}'
# Note: shiningText will be null initially — rawText is stored encrypted
MATERIAL_ID=$(echo "$MATERIAL_RESPONSE" | jq -r .id)

# List materials — rawText should be decrypted in response
curl -s http://localhost:14607/api/v1/profile/materials \
  -H "authorization: Bearer $TOKEN" | jq '[.[] | {id, status, rawText, shiningText}]'

# Update to CONFIRMED with shiningText (REQUIRED for tailoring to work)
# Tailoring uses shiningText (not rawText) as LLM context
curl -s -X PATCH "http://localhost:14607/api/v1/profile/materials/$MATERIAL_ID" \
  -H "authorization: Bearer $TOKEN" \
  -H "content-type: application/json" \
  -d '{
    "status": "CONFIRMED",
    "shiningText": "Led cross-functional product redesign at Stripe, driving 18% conversion uplift by aligning engineering, design, and data teams",
    "tags": ["cross-functional leadership", "data-informed decisions", "stakeholder management"]
  }' | jq '{id, status, shiningText}'
```

---

## Step 5 — Job Analysis

### 5.1 API: Capture a job JD

```bash
# Capture endpoint is POST /jobs/capture
# Response shape: {capture: {...}, radarItem: {...}}
CAPTURE_RESPONSE=$(curl -s -X POST http://localhost:14607/api/v1/jobs/capture \
  -H "authorization: Bearer $TOKEN" \
  -H "content-type: application/json" \
  -d '{
    "source": "linkedin",
    "sourceUrl": "https://linkedin.com/jobs/view/123456",
    "capturedText": "Senior Product Manager at Stripe. 5+ years B2B experience required. Strong cross-functional leadership, data-informed decision making, and stakeholder management. Experience with developer tools preferred."
  }')

echo "$CAPTURE_RESPONSE" | jq '{captureId: .capture.id, radarId: .radarItem.id}'
CAPTURE_ID=$(echo "$CAPTURE_RESPONSE" | jq -r .capture.id)
RADAR_ITEM_ID=$(echo "$CAPTURE_RESPONSE" | jq -r .radarItem.id)

# Save for browser testing below
echo "CAPTURE_ID=$CAPTURE_ID"
echo "RADAR_ITEM_ID=$RADAR_ITEM_ID"

# Wait for LLM analysis
sleep 20

# Verify analysis — use captureId (NOT radarItem.id)
curl -s "http://localhost:14607/api/v1/jobs/$CAPTURE_ID" \
  -H "authorization: Bearer $TOKEN" | jq '{id, title, company, status, parsedJd, matchResult}'
# Expected: title, company populated; parsedJd with hardSkills, softSkills; matchResult with scores
```

### 5.2 Browser: Extension JobAnalysis view

> **Primary verification path. Do this in browser.**

1. Open `http://localhost:14612/job-analysis?id=<CAPTURE_ID>` (use the ID from Step 5.1)
2. Should show:
   - Company name and job title at top
   - Match score visualization (surface match %, deep match %)
   - Skills breakdown (required skills, matched skills, gap skills)
   - Quinn chat panel with initial analysis message
3. Try sending a message to Quinn in the chat panel
4. Quinn should respond with a streaming SSE response visible in real-time
5. Bottom should have "Want to apply?" action buttons

### 5.3 Browser: Extension Radar view

> **Primary verification path. Do this in browser.**

1. Open `http://localhost:14612/radar`
2. Should show a list of jobs you've captured, each as a card with:
   - Company name, job title
   - Status badge (e.g., "saved", "applied", "interview", "offer", "rejected")
   - Last updated timestamp
3. The job captured in Step 5.1 should appear here with status "saved" or "analyzed"
4. Click a job card → should navigate to the job analysis view for that job

---

## Step 6 — Quinn Conversation

### 6.1 API: Conversation SSE stream

```bash
# Create conversation
CONV_RESPONSE=$(curl -s -X POST http://localhost:14607/api/v1/conversations \
  -H "authorization: Bearer $TOKEN" \
  -H "content-type: application/json" \
  -d '{"kind":"FREE_CHAT"}')

CONV_ID=$(echo "$CONV_RESPONSE" | jq -r .id)
echo "Conversation ID: $CONV_ID"

# Send message — SSE stream via GET with query param
curl -N "http://localhost:14607/api/v1/conversations/$CONV_ID/prompt?message=What+are+my+strongest+skills+based+on+my+profile?" \
  -H "authorization: Bearer $TOKEN" \
  -H "accept: text/event-stream"
# Expected: SSE stream with Quinn's response tokens
```

### 6.2 Browser: Quinn chat in extension

> **Do this in browser.**

1. Open `http://localhost:14612/onboarding` or navigate within the extension
2. Type a message in the "Ask Quinn..." input at the bottom
3. Press Enter or click Send
4. Quinn's response should stream in real-time (token by token, not all at once)
5. If response appears all at once or not at all, check the SSE connection in DevTools → Network

---

## Step 7 — Tailoring

### 7.1 API: Set up tailoring prerequisites

```bash
# Tailoring requires: a base resume + parsedJdId (not captureId or radarItemId)

# Step 7.1a: Get CONFIRMED materials for base resume
CONFIRMED_IDS=$(curl -s http://localhost:14607/api/v1/profile/materials \
  -H "authorization: Bearer $TOKEN" | jq '[.[] | select(.status=="CONFIRMED") | .id]')

echo "Confirmed material IDs: $CONFIRMED_IDS"

# Step 7.1b: Create base resume with confirmed materials
BASE_RESUME_RESPONSE=$(curl -s -X POST http://localhost:14607/api/v1/profile/base-resumes \
  -H "authorization: Bearer $TOKEN" \
  -H "content-type: application/json" \
  -d "{\"name\":\"PM Direction\",\"selectedMaterialIds\":$CONFIRMED_IDS}")

echo "$BASE_RESUME_RESPONSE" | jq '{id, name}'
BASE_RESUME_ID=$(echo "$BASE_RESUME_RESPONSE" | jq -r .id)

# Step 7.1c: Get parsedJdId from radar (not the capture.id)
PARSED_JD_ID=$(curl -s http://localhost:14607/api/v1/jobs/radar \
  -H "authorization: Bearer $TOKEN" | jq -r '.[0].parsedJdId')
echo "parsedJdId: $PARSED_JD_ID"

# Step 7.1d: Create tailoring request
TAILOR_RESPONSE=$(curl -s -X POST http://localhost:14607/api/v1/tailoring \
  -H "authorization: Bearer $TOKEN" \
  -H "content-type: application/json" \
  -d "{\"baseResumeId\":\"$BASE_RESUME_ID\",\"parsedJdId\":\"$PARSED_JD_ID\"}")

echo "$TAILOR_RESPONSE" | jq '{id}'
TAILOR_ID=$(echo "$TAILOR_RESPONSE" | jq -r .id)
echo "TAILOR_ID=$TAILOR_ID"

# Step 7.1e: Wait for LLM bullet generation (~30 seconds)
sleep 30

# Verify tailoring result
curl -s "http://localhost:14607/api/v1/tailoring/$TAILOR_ID" \
  -H "authorization: Bearer $TOKEN" | \
  jq '{id, sections: [.sections[] | {title, bulletCount: (.bullets | length), firstBullet: .bullets[0].text}]}'
# Expected: sections with bullets derived from CONFIRMED materials (not fabricated)
```

### 7.2 Browser: Extension Tailoring view

> **Primary verification path. Do this in browser.**

1. Open `http://localhost:14612/tailoring?tailoringId=<TAILOR_ID>` (from Step 7.1)
2. Should show:
   - Match score before/after tailoring
   - Sections (e.g., "Work Experience") with bullet points
   - Each bullet has a source indicator (green = confirmed material, yellow = pending/inferred)
   - Edit controls on each bullet (rewrite, accept, reject)
3. Click "Edit" or "Rewrite" on a bullet → Quinn should offer alternatives
4. Confirm a bullet → status changes to accepted
5. Reject a bullet → it is removed or marked for removal
6. Check that "pending" bullets (LLM inferred, no direct material source) are visually distinct

---

## Step 8 — EasyApply UI

### 8.1 Browser: Extension EasyApply view

> **Do this in browser — this view is UI-only, no direct API equivalent.**

1. First ensure a radar item exists (from Step 5.1 — use `$RADAR_ITEM_ID`)
2. Open `http://localhost:14612/easy-apply?radarItemId=<RADAR_ITEM_ID>`
3. Should show a "fill plan" — the fields Quinn plans to fill and proposed values:
   - Resume: which tailored resume will be attached
   - Contact info: phone, email from profile
   - Open-ended questions: Quinn's drafted answers
   - Experience years for specific skills: inferred from profile
4. Each field should be editable
5. "Approve and fill" button should be present (does NOT submit — user submits manually)

> **Note**: EasyApply auto-fill only works on the real LinkedIn page with the Chrome extension loaded. In dev server mode (`localhost:14612`), this view shows the plan but cannot execute the fill. Test execution requires loading the extension in Chrome (see Step 9 note).

---

## Step 9 — Web Frontend (Full Browser Flow)

### 9.1 Start web dev server

```bash
cd web && pnpm dev
# Runs on http://localhost:14606
```

### 9.2 Homepage

Open `http://localhost:14606`:
- Hero: "Your AI career coach. Right in your browser."
- Nav: FindWith, Pricing, Log in, Install Extension
- Feature cards: Deep Profile, Truthful Tailoring, Full Pipeline
- Footer: Privacy, Terms links

### 9.3 Login from scratch

> **Always test sign-out → sign-in cycle, not just logged-in state.**

1. If already logged in: click "Sign out" in nav → verify you land on homepage, not /dashboard
2. Navigate to `http://localhost:14606/login`
3. Heading: "Sign in (Dev Mode)"
4. Pre-filled: `dev@findwith.local` / `password`
5. Click "Sign in" → redirects to `http://localhost:14606/dashboard`

### 9.4 Dashboard

After login:
- Stats cards: Jobs tracked, Analyses this month, Applications sent
- "Install the FindWith extension" section
- Nav shows: FindWith, Account, Upgrade, Sign out

### 9.5 Account page

Navigate to `http://localhost:14606/dashboard/account`:
- Profile section: Email (dev@findwith.local), Name (Dev User)
- Subscription section: "Free plan (dev mode)", Upgrade link
- Data section: "Export my data", "Manage billing" links
- **Critical**: page must NOT redirect to /login. If it does, the `isLoaded` guard is missing.

### 9.6 Data page

Navigate to `http://localhost:14606/dashboard/data`:
- Should render without error
- Shows data export options

### 9.7 Pricing page

Navigate to `http://localhost:14606/pricing`:
- Three tiers: Free, Pro ($19/mo), Pro Plus ($39/mo)
- Feature comparison
- Upgrade buttons

### 9.8 Install page

Navigate to `http://localhost:14606/install`:
- Step-by-step installation guide
- "Install on Chrome" button
- "Already installed? Sign in here" link

---

## Step 10 — Content Script (LinkedIn injection)

> **Cannot be fully tested in dev server mode.**

Content script injection (the "Ask Quinn" button on LinkedIn job postings) requires:
1. The extension built and loaded unpacked in Chrome
2. User is actually on `linkedin.com/jobs/view/...`

**To test content script in dev:**

1. Build extension: `cd extension && pnpm dev` (watch mode)
2. Open Chrome → `chrome://extensions` → enable "Developer mode"
3. "Load unpacked" → select `extension/dist/`
4. Navigate to any LinkedIn job posting
5. The "Ask Quinn" button should appear injected into the job description area
6. Click it → Side Panel opens with that job's JD pre-loaded

**What the content script does NOT do in dev server mode** (`localhost:14612`):
- No DOM injection on external pages
- The side panel routes work but content auto-capture does not trigger

---

## Step 11 — Follow-up Flow

> **Not yet fully implemented in v0.1.**

The follow-up flow (Quinn proactively asking "did you hear back?" 3 days after applying) is planned but not yet wired. Current state:
- Radar status can be updated manually via API
- Email reading via Gmail content script is planned for v0.2
- No scheduled job exists yet for follow-up reminders

**Manual radar status update (API):**

```bash
# Update radar item status (e.g., mark as "interview")
curl -s -X PATCH "http://localhost:14607/api/v1/jobs/radar/$RADAR_ITEM_ID" \
  -H "authorization: Bearer $TOKEN" \
  -H "content-type: application/json" \
  -d '{"status": "interview"}' | jq '{id, status}'

# Verify status updated in browser:
# Open http://localhost:14612/radar — badge on the job card should change
```

---

## Step 12 — Offer Acceptance / Goodbye Flow

> **Not yet fully implemented in v0.1.**

The offer acceptance flow (Quinn's "goodbye mode" when user marks an offer accepted) is defined in the PRD but not yet implemented in the UI. Current state:
- Radar item status "offer" can be set via API
- Subscription pause on offer acceptance: not yet wired
- Resume archive/download: planned

**To simulate offer acceptance:**

```bash
curl -s -X PATCH "http://localhost:14607/api/v1/jobs/radar/$RADAR_ITEM_ID" \
  -H "authorization: Bearer $TOKEN" \
  -H "content-type: application/json" \
  -d '{"status": "offer"}' | jq '{id, status}'
```

---

## Step 13 — E2E Tests

```bash
# Requires separate e2e infra
docker compose -f docker-compose.e2e.yml up -d
sleep 20

# Build extension for e2e
bash e2e/scripts/build-extension-e2e.sh

# Run tests
cd e2e && NODE_OPTIONS=--no-strip-types pnpm exec playwright test
# Expected: all tests pass

# Cleanup
docker compose -f docker-compose.e2e.yml down -v
```

---

## Quick API Verification Script

For rapid smoke test of API layer only (not a substitute for browser checks):

```bash
#!/bin/bash
# scripts/verify-dev.sh
set -e

echo "=== Health ==="
curl -sf http://localhost:14607/health | jq '.status'
redis-cli -p 14601 PING

echo "=== Auth ==="
JWT=$(curl -s -X POST http://localhost:14611/sign \
  -H 'content-type: application/json' \
  -d '{"sub":"user_dev_001","email":"dev@findwith.local"}' | jq -r .token)

RESPONSE=$(curl -s -X POST http://localhost:14607/api/v1/iam/auth/verify \
  -H "content-type: application/json" \
  -d "{\"clerkToken\": \"$JWT\"}")

TOKEN=$(echo $RESPONSE | jq -r .token)
echo "Token: ${TOKEN:0:20}..."

echo "=== Profile ==="
curl -s http://localhost:14607/api/v1/profile \
  -H "authorization: Bearer $TOKEN" | jq '.basicInfo'

echo "=== Materials ==="
curl -s http://localhost:14607/api/v1/profile/materials \
  -H "authorization: Bearer $TOKEN" | jq 'length'

echo "=== API smoke test passed — run browser verification steps 2-10 ==="
```

---

## Common Issues

### Session token not working

```bash
redis-cli -p 14601 KEYS "session:*"
redis-cli -p 14601 TTL "session:$TOKEN"
# Negative TTL = expired. Re-run Step 2.1.
```

### LLM calls failing

```bash
# Check backend logs
tmux capture-pane -pt findwith:backend -S -100 | grep -E "ERROR|error"

# Verify API key configured
grep -E "ANTHROPIC_API_KEY|OPENAI_API_KEY" backend-ts/.env
```

### Materials not showing in Tailoring

Materials must have `status: "CONFIRMED"` and `shiningText` populated. Tailoring uses `shiningText` as LLM context — if `shiningText` is null, the processor sends an empty context and generates 0 bullets.

```bash
curl -s http://localhost:14607/api/v1/profile/materials \
  -H "authorization: Bearer $TOKEN" | jq '.[] | {id, status, shiningText}'
# Fix: PATCH with status=CONFIRMED and shiningText (see Step 4.2)
```

### Account page redirects to /login immediately

The `isLoaded` guard is missing. The page renders server-side before the mock auth loads, and `isSignedIn` is false. Fix pattern:

```typescript
// web/src/app/dashboard/account/page.tsx
'use client';
import { useAuth } from '@/lib/dev-auth';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function Page() {
  const { isLoaded, isSignedIn } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isLoaded && !isSignedIn) router.push('/login');
  }, [isLoaded, isSignedIn, router]);

  if (!isLoaded) return null;
  if (!isSignedIn) return null;
  // ... rest of page
}
```

### Web login fails (CORS or 401)

Check mock-clerk host port:
```bash
grep MOCK_API web/src/lib/dev-auth.tsx
# Expected: 'http://localhost:14611' (host port)
# Wrong:    'http://localhost:14803' (container-internal port)
```

### Extension side panel blank or shows error

```bash
# Check ext dev server is running on 14612
curl -s http://localhost:14612 -o /dev/null -w '%{http_code}'
# Expected: 200

# Check console in browser DevTools at localhost:14612
# Look for: auth errors, API 401s, missing env vars
```

### Extension auth/verify returns 400

Request body must be JSON `{ clerkToken: jwt }`, NOT Authorization header:
```typescript
// Wrong
fetch('.../auth/verify', { headers: { Authorization: `Bearer ${jwt}` } })

// Correct
fetch('.../auth/verify', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ clerkToken: jwt })
})
```

### Any page: "useAuth can only be used within ClerkProvider"

Pages must import from `@/lib/dev-auth`, not `@clerk/nextjs`:

```typescript
// Wrong (production only)
import { useAuth } from '@clerk/nextjs';

// Correct (works in dev via DevAuthProvider)
import { useAuth } from '@/lib/dev-auth';
```

Affected pages: `dashboard/account`, `dashboard/data`, `billing/success`, `billing/upgrade`, `billing/portal`, `billing/resume`, `auth/extension-callback`.

### Tailoring generates 0 bullets

Three possible causes:
1. `shiningText` is null on all materials (most common) — PATCH materials with shiningText
2. LLM returned malformed JSON — check backend logs for "Failed to parse tailoring output"
3. Bullet ID overflow (varchar 26) — confirm `tailoring.processor.ts` uses `ulid()` not `b.id ?? ulid()`

### Resume parsing stuck at PENDING

```bash
# Check parse job in Redis
redis-cli -p 14601 ZCARD bull:resume-parse:failed

# Check parse status in DB
docker exec findwith-dev-postgres-1 psql -U findwith -d findwith \
  -c 'SELECT id, filename, "parseStatus" FROM profile_resume_sources ORDER BY "createdAt" DESC LIMIT 3'
```

### Profile missing workExperience/education/skills after parsing

Resume parsing populates these via separate entities — if `GET /profile` returns empty arrays, parsing either failed or hasn't completed. Check `parseStatus` (above) and wait longer if still PENDING.

---

## Known Product Gaps (Not Bugs)

1. **Content script not testable in dev server** — LinkedIn button injection requires real extension loaded in Chrome. `localhost:14612` dev server only tests side panel routing.

2. **Follow-up flow not implemented** — Scheduled follow-up reminders (Quinn asks "heard back?" 3 days post-apply) are PRD-defined but not yet built.

3. **Offer acceptance goodbye flow not implemented** — Status update to "offer" works via API but no UI flow exists for Quinn's goodbye + archive sequence.

4. **Quinn context is limited** — System prompt only includes `basicInfo` (name/email). Work experience, materials, and skills are not injected into base context. Quinn needs explicit tool calls to fetch full profile data.

5. **Deep profile chat** — "Start deep profile chat" button navigates to `/` which redirects to `/onboarding`. Feature incomplete.
