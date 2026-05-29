# DR Restore Runbook

## Overview

- **RTO**: ≤ 4 hours
- **RPO**: ≤ 24 hours (nightly dump to R2)
- **Script**: `scripts/dr/restore-from-r2.sh`

## Prerequisites

1. `rclone` configured with R2 remote named `r2`
2. `psql` and `pg_restore` available
3. Environment variables:
   - `RESTORE_DB_URL` — target database connection string
   - `R2_BUCKET` — R2 bucket name (default: `findwith-backups`)
   - `KEK` — Key Encryption Key (from Doppler, NOT from the backup)

## Procedure

### 1. Assess the situation

- Check Sentry for error patterns
- Verify the issue is data-level (not app code)
- Determine target RPO (which backup to restore from)

### 2. Run restore

```bash
# Dry run first
./scripts/dr/restore-from-r2.sh --dry-run

# Actual restore
export RESTORE_DB_URL=postgresql://...
export R2_BUCKET=findwith-backups
export KEK=<from-doppler>
./scripts/dr/restore-from-r2.sh
```

### 3. Verify

- Run `make smoke` against restored DB
- Check encrypted field decryption works
- Verify row counts match expected ranges

### 4. Cut over

- Update Render environment variables to point to new DB
- Restart web + worker services
- Monitor Sentry for 30 minutes

## Backup Schedule

| Type    | Frequency             | Retention | R2 Path    |
| ------- | --------------------- | --------- | ---------- |
| Daily   | Every night 03:00 UTC | 7 days    | `daily/`   |
| Weekly  | Sunday 03:00 UTC      | 4 weeks   | `weekly/`  |
| Monthly | 1st of month          | 3 months  | `monthly/` |

## Important Notes

- DB dumps contain encrypted data (pgcrypto). KEK is NOT in the dump.
- If KEK is lost, encrypted fields are unrecoverable.
- KEK backup is managed separately via Doppler.
- After restore, run the app with KEK to verify encryption round-trip before cutting over.
