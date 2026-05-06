#!/usr/bin/env bash
# Smoke-test the running compose stack. Used in CI and after-deploy.

set -euo pipefail

PROTO="${PROTO:-http}"
HOST="${HOST:-localhost:8080}"
TIMEOUT="${TIMEOUT:-60}"

check() {
    local name="$1"
    local url="$2"
    local i=0
    while [[ $i -lt "$TIMEOUT" ]]; do
        if curl -fsS -o /dev/null --max-time 5 "$url"; then
            echo "  ✓ ${name} healthy"
            return 0
        fi
        sleep 2
        i=$((i + 2))
    done
    echo "  ✗ ${name} not healthy at ${url}"
    return 1
}

echo "→ verifying SlothBox stack at ${PROTO}://${HOST}"

check "caddy" "${PROTO}://${HOST}/healthz"
check "frontend" "${PROTO}://${HOST}/api/healthz"
check "api-gateway" "${PROTO}://${HOST}/api/healthz"
check "ingest" "${PROTO}://${HOST}/ingest/healthz"
check "receipt" "${PROTO}://${HOST}/receipt/healthz"

echo "✓ all services healthy"
