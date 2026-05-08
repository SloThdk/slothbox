# Operational Runbook

How to deploy, operate, and recover SlothBox in production.

## Provisioning a new EU host

Any EU-jurisdiction Linux VM works — the reference deployment uses an ARM
host in a German data centre, but the procedure is the same on any
Debian/Ubuntu 22.04+ box. The example below uses Hetzner Cloud's CLI;
substitute your provider's equivalent.

```bash
# 1. Create the box (any EU-jurisdiction provider with cloud-init works)
hcloud server create \
  --name slothbox-prod-1 \
  --type ccx13 \
  --image ubuntu-24.04 \
  --location nbg1 \
  --ssh-key your-ssh-key

# 2. SSH in
ssh root@<box-ip>

# 3. Install Docker
curl -fsSL https://get.docker.com | sh

# 4. Create app user (don't run as root)
adduser --system --group --home /opt/slothbox slothbox
usermod -aG docker slothbox

# 5. Copy the deploy artifacts
scp docker-compose.yml docker-compose.prod.yml .env.production root@<box-ip>:/opt/slothbox/
chown -R slothbox:slothbox /opt/slothbox/

# 6. Bring it up
sudo -u slothbox docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

## Initial DNS + TLS setup

Caddy auto-issues Let's Encrypt certs. The only requirement: A and AAAA records
for `slothbox.philipsloth.com`, `www.slothbox.philipsloth.com`, and `*.slothbox.philipsloth.com` pointing to the
box's IPv4 / IPv6.

```
A     slothbox.philipsloth.com         <ipv4>
AAAA  slothbox.philipsloth.com         <ipv6>
A     www.slothbox.philipsloth.com     <ipv4>
AAAA  www.slothbox.philipsloth.com     <ipv6>
```

After DNS propagation, Caddy's first run picks up certs automatically.

## Day-to-day operations

### Check service health

```bash
# All services up?
docker compose ps

# Recent logs across services
docker compose logs --tail=200 -f

# A specific service
docker compose logs -f api-gateway

# Health endpoints
curl https://slothbox.philipsloth.com/api/health
curl https://slothbox.philipsloth.com/ingest/health
```

### Roll a new release

CI handles this automatically on push to `master`. Manual deploy if needed:

```bash
ssh root@<box-ip>
cd /opt/slothbox/
sudo -u slothbox docker compose pull
sudo -u slothbox docker compose up -d --remove-orphans
sudo -u slothbox docker compose ps    # verify everything green
```

Healthchecks plus `restart: unless-stopped` give zero-downtime rolling updates
on a single box (dependency order: postgres → minio/valkey/nats → ingest/
receipt/api → web/caddy).

### Database backups

A `pg-backup` sidecar runs on a 02:30 UTC cron and writes a gzipped
`pg_dump` of the `slothbox` database to a named Docker volume
(`pg_backups`). Files rotate after 28 days. The exact command lives in
`docker-compose.prod.yml` under the `pg-backup` service.

This is intentionally the simplest viable backup scheme for v0.1 — one
`gunzip | psql` away from a clean restore, no WAL replay, no archive
storage to provision. v0.5 introduces WAL-G continuous archiving with an
offsite copy on provider block storage; the upgrade is purely additive
(both schemes can run in parallel during the migration window).

Manual base backup, equivalent to what the sidecar runs nightly:

```bash
sudo -u slothbox docker compose exec postgres \
  pg_dump --no-owner --no-acl --clean --if-exists slothbox \
  | gzip -9 \
  > /var/lib/docker/volumes/slothbox_pg_backups/_data/manual-$(date +%Y%m%d-%H%M).sql.gz
```

### Restoring from backup

Worst-case full restore (drill this once a quarter):

```bash
# 1. Identify the dump to restore from. Newest is typically the right
#    answer; rotation keeps 28 days of history under
#    /var/lib/docker/volumes/slothbox_pg_backups/_data/.
ls -lhrt /var/lib/docker/volumes/slothbox_pg_backups/_data/*.sql.gz | tail -5

# 2. Stop the application services that talk to Postgres so they don't
#    write into the half-restored database.
sudo -u slothbox docker compose stop api-gateway ingest receipt reaper

# 3. Bring Postgres up alone (no app traffic).
sudo -u slothbox docker compose up -d postgres

# 4. Restore. The dump uses --clean --if-exists so it drops + recreates
#    the schema cleanly without needing to wipe the volume first.
gunzip -c /var/lib/docker/volumes/slothbox_pg_backups/_data/<dump>.sql.gz \
  | sudo -u slothbox docker compose exec -T postgres \
      psql -U slothbox -d slothbox -v ON_ERROR_STOP=1

# 5. Sanity-check the row counts came back.
sudo -u slothbox docker compose exec postgres psql -U slothbox -d slothbox \
  -c "select count(*) from shares; select count(*) from audit_chain;"

# 6. Bring the application services back.
sudo -u slothbox docker compose up -d
```

### Rotating secrets

Secrets are environment variables. To rotate:

```bash
# 1. Edit /opt/slothbox/.env.production
sudo -u slothbox nano /opt/slothbox/.env.production

# 2. Restart services that read the rotated secret
sudo -u slothbox docker compose up -d --force-recreate <service>
```

Secrets that need rotation when a maintainer leaves:

- `POSTGRES_PASSWORD`
- `MINIO_SECRET_KEY`
- `AUTH_SECRET`
- Cloudflare or any external API keys
- SSH keys on the box

## Incident response

### Suspected data exposure

1. Stop accepting new uploads: `docker compose stop ingest`
2. Snapshot the box: `hcloud server create-image slothbox-prod-1 --type snapshot`
3. Check logs for anomalies: `docker compose logs api-gateway --since=24h`
4. If keys were exposed: rotate every secret in `.env.production`
5. Notify users via the status page if any user data is involved
6. Document the timeline in `docs/incidents/YYYY-MM-DD-summary.md`

### High CPU / memory

Check which container:

```bash
docker stats --no-stream
```

Most likely culprits:

- `ingest` under heavy upload load — scale vertically (CCX23 / CCX33)
- `postgres` on bad query — check `pg_stat_statements`
- `loki` on log ingest — adjust `promtail` rate

### Out of disk

```bash
df -h
docker system df

# Clean unused images
docker image prune -af
docker builder prune -af

# Old MinIO blobs that should have been reaped — fire reaper manually
docker compose exec reaper /reaper --once
```

### Postgres won't start

Check `docker compose logs postgres`. Common issues:

- Volume permission mismatch — `chown -R 999:999 /var/lib/docker/volumes/slothbox_pg_data/_data/`
- Disk full — see above
- Corrupted WAL — restore from base backup

## Monitoring

Grafana at `https://slothbox.philipsloth.com:3030` (behind basic auth — you'll set that up).
Default dashboards:

- **Overview** — uptime per service, request rate, error rate
- **Storage** — MinIO bucket size, blob count, ingest throughput
- **Database** — connections, slow queries, replication lag (when applicable)
- **Receipts** — RFC 3161 latency, audit chain length

Prometheus alerts to watch (set up to email or Discord webhook):

- Any service down for >2 minutes
- Disk usage >80%
- Postgres connection pool exhausted
- Caddy 5xx rate >5% over 5 minutes
- Audit chain Merkle root not published in last 2 hours

## Routine tasks

| Task                                | Frequency                               |
| ----------------------------------- | --------------------------------------- |
| Renew Let's Encrypt certs           | Automatic via Caddy                     |
| Postgres VACUUM ANALYZE             | Automatic via autovacuum                |
| Review Dependabot PRs               | Weekly                                  |
| Review failed login attempts        | Weekly                                  |
| Run full restore drill              | Quarterly                               |
| Rotate secrets (no specific reason) | Yearly                                  |
| Upgrade Postgres minor version      | When upstream patch lands               |
| Upgrade Postgres major version      | Plan a maintenance window, dump-restore |

## Decommissioning

If SlothBox shuts down:

1. Notify users 30 days in advance via dashboard banner + email
2. Disable new uploads
3. Allow existing shares to expire naturally OR provide a bulk-download tool
4. Publish a final Merkle root anchor
5. Take a final snapshot, archive to provider block storage (90-day retention)
6. Tear down the production VM
7. Leave the GitHub repo and historical Merkle anchors public so any unexpired
   receipts remain verifiable
