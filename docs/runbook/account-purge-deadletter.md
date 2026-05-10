# Account Purge Dead Letter Runbook (U-05)

## Overview

When an AccountPurgeSaga step fails 5 times, the saga enters dead letter state. This runbook describes the manual recovery process.

## Alert

- **Sentry**: `AccountPurgeSaga.dead_letter` error with `saga_id` and `user_id`
- **Email**: Ops receives automated email with saga details and this runbook URL

## Manual Cleanup Order

**CRITICAL**: Follow this exact order. Each step is idempotent — safe to retry.

### 1. Stripe (do first — prevent further charges)

```bash
# Check if customer still exists
stripe customers retrieve cus_XXXX

# Cancel all subscriptions
stripe subscriptions list --customer cus_XXXX
stripe subscriptions cancel sub_XXXX

# Delete customer
stripe customers delete cus_XXXX
```

### 2. Clerk

```bash
# Delete Clerk user (irreversible — only after confirming Stripe is clean)
curl -X DELETE https://api.clerk.com/v1/users/{clerk_user_id} \
  -H "Authorization: Bearer sk_live_xxx"
```

### 3. S3/R2

```bash
# List user objects
rclone ls r2:findwith-prod/users/{user_id}/

# Delete all
rclone purge r2:findwith-prod/users/{user_id}/
```

### 4. Database

```sql
-- Run in this order (respect FK-like dependencies)
BEGIN;

DELETE FROM profile_materials WHERE user_id = 'USER_ID';
DELETE FROM profile_skills WHERE user_id = 'USER_ID';
DELETE FROM profile_projects WHERE user_id = 'USER_ID';
DELETE FROM profile_work_experiences WHERE user_id = 'USER_ID';
DELETE FROM profile_education WHERE user_id = 'USER_ID';
DELETE FROM profile_resume_sources WHERE user_id = 'USER_ID';
DELETE FROM profile_base_resumes WHERE user_id = 'USER_ID';
DELETE FROM profile_profiles WHERE user_id = 'USER_ID';

DELETE FROM conv_messages WHERE conversation_id IN (
  SELECT id FROM conv_conversations WHERE user_id = 'USER_ID'
);
DELETE FROM conv_conversations WHERE user_id = 'USER_ID';

DELETE FROM jobs_match_results WHERE user_id = 'USER_ID';
DELETE FROM jobs_radar_items WHERE user_id = 'USER_ID';
DELETE FROM jobs_captures WHERE user_id = 'USER_ID';

DELETE FROM tailoring_snapshots WHERE tailored_resume_id IN (
  SELECT id FROM tailoring_resumes WHERE user_id = 'USER_ID'
);
DELETE FROM tailoring_resumes WHERE user_id = 'USER_ID';

DELETE FROM apply_applications WHERE user_id = 'USER_ID';
DELETE FROM apply_fill_plans WHERE user_id = 'USER_ID';

DELETE FROM followup_drafts WHERE user_id = 'USER_ID';
DELETE FROM followup_emails WHERE user_id = 'USER_ID';

DELETE FROM reco_recommendations WHERE user_id = 'USER_ID';
DELETE FROM quota_consume_log WHERE user_id = 'USER_ID';
DELETE FROM quota_usage_counters WHERE user_id = 'USER_ID';
DELETE FROM billing_subscriptions WHERE user_id = 'USER_ID';
DELETE FROM iam_settings WHERE user_id = 'USER_ID';
DELETE FROM iam_users WHERE id = 'USER_ID';

COMMIT;
```

### 5. Verify

```sql
-- Should return 0 for all
SELECT 'iam_users', COUNT(*) FROM iam_users WHERE id = 'USER_ID'
UNION ALL
SELECT 'profile_profiles', COUNT(*) FROM profile_profiles WHERE user_id = 'USER_ID'
UNION ALL
SELECT 'billing_subscriptions', COUNT(*) FROM billing_subscriptions WHERE user_id = 'USER_ID';
```

### 6. Write GDPR Purge Log

```sql
INSERT INTO gdpr_purge_log (user_id, purged_at, purged_by, method)
VALUES ('USER_ID', NOW(), 'ops-manual', 'deadletter-runbook');
```

## Post-Cleanup

1. Close the Sentry issue
2. Reply to the ops email confirming cleanup
3. If the failure was systemic (e.g., Stripe API change), file a bug to fix the saga step
