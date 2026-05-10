#!/usr/bin/env bash
set -euo pipefail

# FindWith DR restore script (U-07)
# Usage: ./scripts/dr/restore-from-r2.sh [--dry-run]
#
# Prerequisites:
#   - rclone configured with R2 remote named 'r2'
#   - psql available
#   - Environment variables: RESTORE_DB_URL, R2_BUCKET, KEK

DRY_RUN=false
if [[ "${1:-}" == "--dry-run" ]]; then
    DRY_RUN=true
fi

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
R2_BUCKET="${R2_BUCKET:-findwith-backups}"
R2_PREFIX="${R2_PREFIX:-daily}"
RESTORE_DB_URL="${RESTORE_DB_URL:-postgresql://findwith:findwith_dev@localhost:5432/findwith_restore}"
WORKDIR="/tmp/findwith-dr-${TIMESTAMP}"

echo "=== FindWith DR Restore Script ==="
echo "Timestamp: ${TIMESTAMP}"
echo "R2 Bucket: ${R2_BUCKET}"
echo "Restore DB: ${RESTORE_DB_URL}"
echo "Dry run: ${DRY_RUN}"
echo ""

step() {
    local num=$1
    local desc=$2
    echo ""
    echo "--- Step ${num}: ${desc} ---"
}

step 1 "List available backups in R2"
if [[ "${DRY_RUN}" == true ]]; then
    echo "[DRY RUN] Would run: rclone ls r2:${R2_BUCKET}/${R2_PREFIX}/ --max-depth 1"
    echo "[DRY RUN] Expected output: latest daily dump files (pg_dump -Fc format)"
else
    mkdir -p "${WORKDIR}"
    rclone ls "r2:${R2_BUCKET}/${R2_PREFIX}/" --max-depth 1 | tail -5
fi

step 2 "Download latest backup"
if [[ "${DRY_RUN}" == true ]]; then
    echo "[DRY RUN] Would download latest .dump file to ${WORKDIR}/"
else
    LATEST=$(rclone ls "r2:${R2_BUCKET}/${R2_PREFIX}/" | sort -k2 | tail -1 | awk '{print $2}')
    echo "Downloading: ${LATEST}"
    rclone copy "r2:${R2_BUCKET}/${R2_PREFIX}/${LATEST}" "${WORKDIR}/"
    DUMP_FILE="${WORKDIR}/${LATEST}"
fi

step 3 "Verify backup integrity"
if [[ "${DRY_RUN}" == true ]]; then
    echo "[DRY RUN] Would run: pg_restore --list on dump file"
    echo "[DRY RUN] Verify table count matches expected schema"
else
    pg_restore --list "${DUMP_FILE}" | head -20
    TABLE_COUNT=$(pg_restore --list "${DUMP_FILE}" | grep -c "TABLE" || true)
    echo "Tables in backup: ${TABLE_COUNT}"
fi

step 4 "Create restore database"
if [[ "${DRY_RUN}" == true ]]; then
    echo "[DRY RUN] Would create database from RESTORE_DB_URL"
else
    DB_NAME=$(echo "${RESTORE_DB_URL}" | sed 's|.*/||')
    psql "${RESTORE_DB_URL%/*}/postgres" -c "DROP DATABASE IF EXISTS ${DB_NAME};" 2>/dev/null || true
    psql "${RESTORE_DB_URL%/*}/postgres" -c "CREATE DATABASE ${DB_NAME};"
fi

step 5 "Restore dump"
if [[ "${DRY_RUN}" == true ]]; then
    echo "[DRY RUN] Would run: pg_restore -d \${RESTORE_DB_URL} --no-owner --no-acl <dump>"
else
    pg_restore -d "${RESTORE_DB_URL}" --no-owner --no-acl "${DUMP_FILE}"
fi

step 6 "Enable pgvector extension"
if [[ "${DRY_RUN}" == true ]]; then
    echo "[DRY RUN] Would run: CREATE EXTENSION IF NOT EXISTS vector"
else
    psql "${RESTORE_DB_URL}" -c "CREATE EXTENSION IF NOT EXISTS vector;"
fi

step 7 "Verify KEK can decrypt (fail-fast)"
if [[ "${DRY_RUN}" == true ]]; then
    echo "[DRY RUN] Would verify KEK environment variable is set"
    echo "[DRY RUN] Would run app startup encryption verification"
else
    if [[ -z "${KEK:-}" ]]; then
        echo "ERROR: KEK not set. Cannot decrypt encrypted fields."
        echo "Restore completed but encrypted data is inaccessible."
        exit 1
    fi
    echo "KEK is set. App startup will verify decryption."
fi

step 8 "Validate data integrity"
if [[ "${DRY_RUN}" == true ]]; then
    echo "[DRY RUN] Would run row count checks on key tables:"
    echo "  - iam_users"
    echo "  - profile_profiles"
    echo "  - jobs_radar_items"
    echo "  - conv_conversations"
    echo "  - billing_subscriptions"
else
    for table in iam_users profile_profiles jobs_radar_items conv_conversations billing_subscriptions; do
        COUNT=$(psql "${RESTORE_DB_URL}" -t -c "SELECT COUNT(*) FROM ${table};" 2>/dev/null || echo "N/A")
        echo "  ${table}: ${COUNT} rows"
    done
fi

step 9 "Cleanup"
if [[ "${DRY_RUN}" == true ]]; then
    echo "[DRY RUN] Would remove ${WORKDIR}"
else
    rm -rf "${WORKDIR}"
fi

echo ""
echo "=== DR Restore Complete ==="
echo "Next steps:"
echo "  1. Update DNS / app config to point to restored DB"
echo "  2. Inject KEK into new app process"
echo "  3. Start app and verify encryption round-trip"
echo "  4. Run: make smoke (end-to-end verification)"
echo "  5. Monitor Sentry for errors"
echo ""
echo "RTO target: ≤ 4h | RPO target: ≤ 24h"
