#!/usr/bin/env bash
# Manual Postgres + MinIO backup. WAL-G handles continuous archiving;
# this is for one-off snapshots before risky operations.

set -euo pipefail

TIMESTAMP=$(date -u +%Y%m%d-%H%M%S)
BACKUP_DIR="${BACKUP_DIR:-/opt/slothbox/backups/${TIMESTAMP}}"

mkdir -p "${BACKUP_DIR}"

echo "→ Postgres dump"
docker compose exec -T postgres pg_dump \
    -U "${POSTGRES_USER:-slothbox}" \
    -d "${POSTGRES_DB:-slothbox}" \
    --format=custom \
    --compress=9 \
    > "${BACKUP_DIR}/postgres-${TIMESTAMP}.dump"

echo "→ MinIO bucket mirror"
docker compose exec -T minio mc mirror \
    --quiet \
    /data/slothbox-blobs \
    "${BACKUP_DIR}/minio-blobs-${TIMESTAMP}/"

echo "→ encrypting backup with age"
if ! command -v age >/dev/null 2>&1; then
    echo "  ⚠ age not installed — backup left UNENCRYPTED at ${BACKUP_DIR}"
    echo "  Install age and re-encrypt before sending offsite."
    exit 0
fi

if [[ -z "${BACKUP_PUBLIC_KEY:-}" ]]; then
    echo "  ⚠ BACKUP_PUBLIC_KEY not set — backup left UNENCRYPTED"
    exit 0
fi

tar czf - -C "${BACKUP_DIR}" . | age -r "${BACKUP_PUBLIC_KEY}" -o "${BACKUP_DIR}.tar.gz.age"
rm -rf "${BACKUP_DIR}"

echo "✓ encrypted backup at ${BACKUP_DIR}.tar.gz.age"
