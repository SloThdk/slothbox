#!/usr/bin/env bash
# Manual deployment helper. CI does this automatically; use this for emergencies.

set -euo pipefail

: "${HETZNER_HOST:?Set HETZNER_HOST to the prod box IP or hostname}"
: "${HETZNER_USER:?Set HETZNER_USER (typically root or slothbox)}"
: "${IMAGE_TAG:=latest}"

echo "→ deploying tag ${IMAGE_TAG} to ${HETZNER_USER}@${HETZNER_HOST}"

ssh "${HETZNER_USER}@${HETZNER_HOST}" \
    "cd /opt/slothbox && \
     export IMAGE_TAG=${IMAGE_TAG} && \
     docker compose -f docker-compose.yml -f docker-compose.prod.yml pull && \
     docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --remove-orphans && \
     docker compose -f docker-compose.yml -f docker-compose.prod.yml ps"

echo "→ running smoke test"
for i in {1..30}; do
    if curl -fsS "https://${PRODUCTION_DOMAIN:-slothbox.philipsloth.com}/healthz"; then
        echo "✓ deployment healthy"
        exit 0
    fi
    sleep 2
done
echo "✗ deployment did not become healthy in 60s"
exit 1
