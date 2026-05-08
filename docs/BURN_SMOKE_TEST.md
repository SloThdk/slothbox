# Burn-after-read end-to-end smoke test

Verify migration 0004 actually defends against the curl-skip-the-callback
attack class flagged in
[`audits/2026-05-08-slothbox-slothcv/11-slothbox-burn-smoke-test.md`](../../../audits/2026-05-08-slothbox-slothcv/11-slothbox-burn-smoke-test.md).

Run this against a freshly-spun-up local stack BEFORE shipping any change
that touches `services/ingest/Endpoints/DownloadEndpoint.cs`,
`apps/api-gateway/src/routes/shares.ts`, the `mark_chunk_served` SQL
function, or the share-chunks schema. The goal is to confirm the burn
fires from the **server's** perspective even when the recipient never
calls the gateway's `/downloaded` endpoint.

## Prerequisites

1. `docker compose up -d` brings the full stack online and migration 0004
   has applied (check via `docker compose exec postgres psql -U slothbox
-c "SELECT proname FROM pg_proc WHERE proname = 'mark_chunk_served';"`
   — should return one row).
2. `pnpm install` and `cd packages/crypto-core && pnpm build` so the
   `tools/encrypt-cli` script below can resolve the libsodium wrapper
   from the workspace.
3. `jq` and `curl` on PATH.

## Test 1 — happy path with cooperative client (regression)

The polite-client path must still work. Drag a file onto
`http://localhost` (or whatever Caddy is bound to in dev), copy the
share link, open it in another browser, click decrypt. The file should
download, and the share should disappear.

```bash
# Verify the share went destroyed
docker compose exec postgres psql -U slothbox -c \
  "SELECT short_id, state, destroyed_reason FROM shares ORDER BY created_at DESC LIMIT 1;"
# Expect: state='destroyed', destroyed_reason='burn'

# Verify a share_destroyed audit entry landed
docker compose exec postgres psql -U slothbox -c \
  "SELECT event_type, payload->>'trigger' FROM audit_chain ORDER BY seq DESC LIMIT 3;"
# Expect at least one row: event_type='share_destroyed' AND
#   trigger='ingest_last_chunk' (server-side burn won the race)
#   OR trigger='gateway_downloaded' (rare — only if the polite POST
#   beat the last chunk's mark_chunk_served commit, which can happen
#   on tiny files that complete before the SQL function's row lock
#   acquires).
```

## Test 2 — hostile recipient, never POSTs `/downloaded`

This is the test that would have failed before migration 0004. We
fetch metadata + every chunk by curl, decrypt locally, and **never**
call `POST /api/shares/:shortId/downloaded`. The share should still go
destroyed.

### Step 1 — create a burn-after-read share

Use the dev UI to upload a file with the burn-after-read box ticked,
then capture the share URL it generates. Or use this scripted upload
(adjust the file path):

```bash
# Browser-side encryption + chunk PUT via the libsodium wrapper.
# tools/encrypt-cli is a thin Node script that mirrors what the web
# UI does; use it from the dev shell.
SHARE_URL=$(node tools/encrypt-cli/index.mjs \
  --file ./README.md \
  --burn-after-read \
  --ttl 300 \
  --gateway http://localhost/api \
  --ingest http://localhost/ingest)
echo "Share URL: $SHARE_URL"
SHORT_ID=$(echo "$SHARE_URL" | sed -E 's|.*/s/([^#]+)#.*|\1|')
KEY=$(echo "$SHARE_URL" | sed -E 's|.*#key=([^&]+).*|\1|')
echo "shortId: $SHORT_ID"
```

### Step 2 — confirm the share is `ready`

```bash
docker compose exec postgres psql -U slothbox -c \
  "SELECT state, burn_after_read, download_count
   FROM shares WHERE short_id = '$SHORT_ID';"
# Expect: state='ready', burn_after_read=true, download_count=0

docker compose exec postgres psql -U slothbox -c \
  "SELECT chunk_index, served_at, served_count
   FROM share_chunks WHERE share_id =
     (SELECT id FROM shares WHERE short_id = '$SHORT_ID')
   ORDER BY chunk_index;"
# Expect: every served_at IS NULL, served_count = 0
```

### Step 3 — fetch metadata + every chunk via curl, no `/downloaded` POST

```bash
META=$(curl -s "http://localhost/api/shares/$SHORT_ID")
CHUNK_COUNT=$(echo "$META" | jq -r '.chunkCount')
echo "Pulling $CHUNK_COUNT chunks..."

mkdir -p /tmp/burn-smoke
for i in $(seq 0 $((CHUNK_COUNT - 1))); do
  curl -s "http://localhost/ingest/chunk/$SHORT_ID/$i" \
    -o /tmp/burn-smoke/chunk-$i.bin
  echo "  chunk $i: $(wc -c < /tmp/burn-smoke/chunk-$i.bin) bytes"
done

# CRITICAL: do NOT call POST /api/shares/$SHORT_ID/downloaded.
# This is the attack — a hostile recipient pulls bytes via curl and
# never cooperates with the polite-client signal.
```

### Step 4 — verify the burn fired anyway (post-fix expectation)

```bash
docker compose exec postgres psql -U slothbox -c \
  "SELECT state, destroyed_reason, destroyed_at, download_count
   FROM shares WHERE short_id = '$SHORT_ID';"
# POST-FIX (migration 0004 applied): expect state='destroyed',
# destroyed_reason='burn', destroyed_at IS NOT NULL, download_count=1.
#
# PRE-FIX (without migration 0004): state='ready', destroyed_reason
# IS NULL, download_count=0 — this is the bug the migration closes.

docker compose exec postgres psql -U slothbox -c \
  "SELECT chunk_index, served_at IS NOT NULL AS served, served_count
   FROM share_chunks WHERE share_id =
     (SELECT id FROM shares WHERE short_id = '$SHORT_ID')
   ORDER BY chunk_index;"
# Expect: every served=true, served_count=1.

docker compose exec postgres psql -U slothbox -c \
  "SELECT seq, event_type, payload->>'trigger', payload->>'shortId'
   FROM audit_chain
   WHERE payload->>'shortId' = '$SHORT_ID'
   ORDER BY seq;"
# Expect:
#   share_created   trigger=NULL   shortId=$SHORT_ID
#   share_destroyed trigger='ingest_last_chunk'   shortId=$SHORT_ID
```

### Step 5 — verify the share is unreachable

```bash
# Gateway returns 404 (share looks like it never existed)
curl -s -o /dev/null -w "%{http_code}\n" \
  "http://localhost/api/shares/$SHORT_ID"
# Expect: 404

# Ingest returns 410 Gone for any chunk
curl -s -o /dev/null -w "%{http_code}\n" \
  "http://localhost/ingest/chunk/$SHORT_ID/0"
# Expect: 410
```

### Step 6 — verify reaper cleanup completes within 60 s

```bash
sleep 65
docker compose exec postgres psql -U slothbox -c \
  "SELECT COUNT(*) AS chunks_remaining FROM share_chunks WHERE share_id =
     (SELECT id FROM shares WHERE short_id = '$SHORT_ID');"
# Expect: 0

docker compose exec minio mc ls minio/slothbox/$SHORT_ID/
# Expect: empty (or "Object does not exist")
```

## Test 3 — race: polite client AND server-side burn fire concurrently

Reuse Test 2's setup, then immediately after the last `curl` for chunk
N-1 returns, fire the polite POST too. Both paths converge on the same
state; only one path fires the burn.

```bash
# After Step 3 above:
curl -s -o /dev/null -w "%{http_code}\n" \
  -X POST "http://localhost/api/shares/$SHORT_ID/downloaded"
# Expect: 200 (idempotent path — server-side burn already won)
```

Verify exactly one `share_destroyed` audit entry lands per share:

```bash
docker compose exec postgres psql -U slothbox -c \
  "SELECT event_type, COUNT(*)
   FROM audit_chain
   WHERE payload->>'shortId' = '$SHORT_ID'
   GROUP BY event_type
   ORDER BY event_type;"
# Expect: share_created=1, share_destroyed=1.
```

(The reaper's later cleanup pass appends ANOTHER `share_destroyed`
entry once it deletes the blobs — that's per-design, not a duplicate.
Filter by trigger to distinguish: `payload->>'trigger' =
'ingest_last_chunk'` is the burn-fire entry; the reaper's entry has no
`trigger` field set.)

## What "passes" means

| Test                  | Pre-migration-0004 | Post-migration-0004  |
| --------------------- | ------------------ | -------------------- |
| Test 1 (cooperative)  | ✅                 | ✅                   |
| Test 2 (hostile curl) | ❌ share survives  | ✅ share burns       |
| Test 3 (race)         | N/A                | ✅ exactly-once burn |

Test 2 is the regression gate — if it fails on a future change, the
hostile-recipient hole has been reopened.

## Caveats

- **Two simultaneous readers** is still NOT defended in v0.1. If you
  start two parallel `for i in ...` loops against the same share, both
  may complete before the burn fires. Single-use HMAC chunk tokens
  close that hole in v0.5 — see SECURITY.md §"How burn-after-read
  works in v0.1".
- This runbook is manual today. The placeholder `apps/api-gateway/
tests/smoke.test.ts` will replace it with an automated equivalent
  once the v0.5 test infrastructure (testcontainers + a real Postgres
  per spec run) lands.
