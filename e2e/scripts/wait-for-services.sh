#!/usr/bin/env bash
# Wait for all e2e infrastructure services to be healthy.
set -euo pipefail

TIMEOUT=120
INTERVAL=3

wait_for() {
  local name="$1"
  local check="$2"
  local elapsed=0

  echo "Waiting for $name..."
  while ! eval "$check" &>/dev/null; do
    if [ "$elapsed" -ge "$TIMEOUT" ]; then
      echo "ERROR: $name did not become ready within ${TIMEOUT}s"
      exit 1
    fi
    sleep "$INTERVAL"
    elapsed=$((elapsed + INTERVAL))
  done
  echo "  $name is ready"
}

wait_for "PostgreSQL (e2e)"  "pg_isready -h localhost -p 5434 -U e2e -d findwith_e2e"
wait_for "Redis (e2e)"       "redis-cli -p 6381 ping | grep -q PONG"
wait_for "MinIO"             "curl -sf http://localhost:9000/minio/health/live"
wait_for "LLM mock server"   "curl -sf http://localhost:11435/health"
wait_for "DOM fixtures"      "curl -sf http://localhost:8081/"

echo "All e2e services are ready."
