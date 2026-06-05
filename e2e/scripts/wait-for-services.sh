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

wait_for "PostgreSQL (e2e)"  "pg_isready -h localhost -p 14800 -U e2e -d findwith_e2e"
wait_for "Redis (e2e)"       "redis-cli -p 14801 ping | grep -q PONG"
wait_for "MinIO (e2e)"       "curl -sf http://localhost:14802/minio/health/live"
wait_for "Mock DOM"          "curl -sf http://localhost:14808/health"
wait_for "Mock LLM"          "curl -sf http://localhost:14809/health"
wait_for "Mock Stripe"       "curl -sf http://localhost:14810/health"
wait_for "Mock Clerk"        "curl -sf http://localhost:14811/health"

echo "All e2e services are ready."
