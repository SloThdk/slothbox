# Postgres backup — operator runbook

Updated for v0.2.1.

The `pg-backup` sidecar in `docker-compose.prod.yml` runs `pg_dump` nightly
at 02:30 UTC, writes the gzipped output to a named Docker volume
(`pg_backups`), and prunes anything older than `BACKUP_RETENTION_DAYS`
(default 28).

This document covers two operator concerns the base sidecar doesn't solve:

1. **At-rest encryption** of the dumps (via `age`), so a compromise of
   the host volume leaks ciphertext, not plaintext SQL.
2. **Off-site replication** (rclone / aws-cli / restic), so the host
   itself failing doesn't lose the only copy.

The two are independent — you can run either, both, or neither.

---

## 1. Encrypted dumps (recommended)

### Set up the age keypair

On a separate device the SlothBox host never sees — your laptop, a
YubiKey, an offline air-gapped machine — generate an age keypair:

```bash
age-keygen -o slothbox-backup.key
# Public key: age1abc...
```

The file `slothbox-backup.key` holds the private key. **Never copy this
file to the production host.** Keep it on the device you'd use to
restore from backup, ideally on encrypted storage (FileVault, LUKS,
YubiKey static slot, ...).

The `age1abc...` public key is what you put on the host.

### Tell the sidecar to use it

In the production host's `.env`:

```
BACKUP_AGE_RECIPIENT=age1abc...recipient...
```

For redundancy you can list multiple recipients (e.g. a primary key on
your laptop and a backup key on a YubiKey in a safe), comma-separated:

```
BACKUP_AGE_RECIPIENT=age1primary...,age1yubikey...
```

Each recipient's public key gets a copy of the dump file key in the age
header. Any one private key can decrypt the dump.

### What changes on disk

Without `BACKUP_AGE_RECIPIENT`:

```
/backups/slothbox-2026-05-11T02-30-00Z.sql.gz
```

With it:

```
/backups/slothbox-2026-05-11T02-30-00Z.sql.gz.age
```

Both extensions are pruned by the retention rule, so the operator can
switch encryption on or off mid-stream without breaking cleanup.

### Restoring an encrypted dump

```bash
age -d -i slothbox-backup.key slothbox-2026-05-11T02-30-00Z.sql.gz.age \
  | gunzip \
  | psql -h <host> -U <user> -d <db>
```

`age -d -i <keyfile>` decrypts using the private key; the dump is then
the same `gzip | sql` shape the un-encrypted backup uses.

---

## 2. Off-site replication

The base sidecar writes only to the local `pg_backups` named volume. To
get a second copy off the host:

### Option A — host-level `rclone` (simplest)

On the production host, set up an `rclone` remote pointing at any
EU-jurisdiction object store (Wasabi EU, BackBlaze B2 EU, Storj EU,
your own MinIO on a different VM, ...):

```bash
rclone config            # interactive setup
# Name it `offsite`. Pick `Amazon S3` and the EU-region endpoint.
```

Then add a systemd timer or cron entry that runs every morning at
03:00 UTC (after the sidecar's 02:30 dump):

```cron
0 3 * * * /usr/bin/rclone copy --quiet /var/lib/docker/volumes/slothbox_pg_backups/_data offsite:slothbox-backups
```

Because the dumps are already `.age`-encrypted on disk (per section 1),
this off-site copy carries ciphertext — no separate transport
encryption layer needed beyond the rclone-default TLS. If you skipped
section 1, your off-site object store sees plaintext SQL, which is
usually NOT what you want.

### Option B — restic (point-in-time snapshots)

`restic` adds deduplication + atomic snapshots if you want
point-in-time recovery semantics. The setup is identical in shape to
rclone — point it at an EU-jurisdiction object store, set a strong
restic-side password, run from cron.

For SlothBox-scale (small DB, slow churn), option A is enough. restic
is the right tool if you're also backing up the MinIO ciphertext blob
volumes.

### Recovery drill

Run this once per quarter. A backup that can't be restored is not a
backup.

```bash
# 1. Pull the most recent .age dump from your off-site store.
rclone copy offsite:slothbox-backups/slothbox-2026-05-11T02-30-00Z.sql.gz.age .

# 2. Decrypt it on the device that holds the age private key.
age -d -i slothbox-backup.key slothbox-2026-05-11T02-30-00Z.sql.gz.age \
  | gunzip > recovered.sql

# 3. Restore into a throwaway local Postgres to verify it actually loads.
docker run --rm -it -e POSTGRES_PASSWORD=t -p 5454:5432 postgres:16.4-alpine
psql -h localhost -p 5454 -U postgres < recovered.sql

# 4. Spot-check: row counts of the top-3 tables match the production
#    Grafana dashboard, audit-chain head hash matches the production
#    `verify_audit_chain` RPC output.
```

If any of these steps fail, fix the pipeline NOW — not when you need
the backup.

---

## 3. What's NOT covered here

- **WAL-G continuous archiving.** Point-in-time recovery to within
  seconds is the v0.5 backup story. For v0.2 the nightly `pg_dump`
  - 30-day retention is sufficient given the dataset size and churn.
- **MinIO blob backup.** The ciphertext chunks in MinIO are not
  backed up — they're already encrypted at rest, and the share lifecycle
  is short (≤ 30 days TTL), so losing the MinIO volume costs at most
  one TTL window of in-flight shares. If your threat model requires
  resilient blob storage, run MinIO in `MNMD` (multi-node multi-disk)
  mode and replicate the chunks across two hosts.
- **Postgres replication.** Single-host SlothBox doesn't run a
  read replica. Failover is "restore the most recent dump on a fresh
  host". The dataset is small enough that this takes minutes, not
  hours.
