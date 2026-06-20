# FindWith Plans

## 🟠 Under Validation: Core Flow Bugs `pm:awaiting-validation`

> Verification run: 2026-06-16 by Claude Code (Sonnet 4.6)
> Against: `docs/tech/core-flows.md` (authored by peer 1:4.1)

### ❌ Confirmed Failures (To Fix)

- [ ] **Flow 5**: Email `kind` never populated — `classify-email` / `draft-reply` LLM tools not implemented `awaiting-validation`
- [ ] **Flow 6**: Click tracking always 404 — HMAC verification fails even with correct formula `awaiting-validation`

### ⚠️ Functional Gaps (To Fix or Clarify)

- [ ] **Flow 4**: Fill plan `fields[*].label` always null (entity stores `fieldName`, not mapped) `awaiting-validation`
- [ ] **Flow 4**: Fill plan uses LLM-invented stub data, not user's actual profile (name/email/phone) `awaiting-validation`
- [ ] **Flow 3**: Tailoring produces 0 bullets in fresh dev env (0 materials + empty hardSkills) `awaiting-validation`
- [ ] **Flow 2**: JD parsing returns empty `hardSkills`/`title` — regex may fail on Qwen thinking-mode preamble `awaiting-validation`
- [ ] **Flow 1 & 2**: SSE `/conversations/:id/prompt` 500s without `?message=` (docs say no param needed) `awaiting-validation`

### 📖 Doc/Code Discrepancies (Docs Need Update)

- [ ] `GET /jobs/:id` takes **captureId** not radarItemId (docs say radarItemId) `awaiting-validation`
- [ ] Invalid radar transitions return **403** not 422 (docs claim 422) `awaiting-validation`
- [ ] Tailoring response shape is `{sections:[]}` not `{bullets:[]}` as docs describe `awaiting-validation`
- [ ] `CaptureEmailDto` missing `source` field (docs expect it) `awaiting-validation`
