# Verifiable Deletion

How SlothBox proves a file is gone, not just promises it. **The in-database
destruction chain shipped in v0.1 and is part of the current v0.2 line; the
publicly verifiable Merkle anchor + offline verifier CLI land in v1.0.**

## What ships today (v0.2 line)

| Capability                                                   | Status                                                                                                                                                                      |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Burn-after-read fires on hostile recipients                  | ✅ Migration 0004 — server-driven trigger via `mark_chunk_served`. A non-cooperating client cannot suppress the burn.                                                       |
| State flip atomic with audit-chain entry                     | ✅ The `mark_chunk_served` SQL function commits the state transition and the `share_destroyed` chain entry inside one transaction.                                          |
| MinIO ciphertext removed on destruction                      | ✅ The reaper's 60 s sweep picks up rows that still have chunks — `state='destroyed'` (burn / revoke) and `state='expired'` (TTL or max_downloads) — and deletes the blobs. |
| In-database hash-chained audit log                           | ✅ Every destruction lands in `audit_chain` (SHA-256 prev/entry hash, advisory-locked single-writer ordering — see migration 0002).                                         |
| Public Merkle root anchored to a read-only external endpoint | ❌ **v1.0.** Required to make destruction verifiable without trusting the live database.                                                                                    |
| Offline verifier CLI (`slothbox-verify`)                     | 🚧 Skeleton in v0.1; full verification of receipts and deletion proofs in **v1.0**. Distributable via `brew tap` / `scoop bucket` / `apt`.                                  |
| Per-recipient encryption (`age` sealed boxes)                | ❌ **v1.0.** Today the symmetric key is in the URL fragment, so two parallel readers can both download. Per-recipient `age` makes the URL recipient-bound.                  |

## How destruction works (current)

```
1. Trigger fires:
     - burn-after-read (server-side, via mark_chunk_served on last
       chunk delivery — see SECURITY.md and the source notes in
       services/ingest/Endpoints/DownloadEndpoint.cs)
     - expiry (TTL elapsed; the reaper picks it up)
     - max_downloads reached (gateway's increment_download flips the
       share to state='expired'; the reaper then destroys it)
     - manual revoke (POST /api/shares/:shortId/destroy)

2. State flip:
   Burn-after-read and manual revoke flip the share directly. The
   triggering path atomically:
     - sets shares.state = 'destroyed'
     - sets destroyed_at = now(), destroyed_reason = <reason>
     - bumps download_count (only when burn fires on the read path)
     - appends a `share_destroyed` row to audit_chain
   All inside one Postgres transaction.

   max_downloads is a two-step path: increment_download flips the share
   to state='expired' when the cap is reached, and the reaper's sweep
   (below) performs the destruction with destroyed_reason='max_downloads'.

3. Reaper sweep (≤ 60 s later):
     a. selectReapableSQL picks up rows that still have share_chunks:
        already-destroyed shares (burn / manual revoke), expired shares
        (TTL lapsed), and max_downloads shares left in state='expired' by
        increment_download. The cap-reached branch is destroyed with
        destroyed_reason='max_downloads' (see services/reaper).
     b. Reads chunk blob_keys from share_chunks.
     c. Removes blobs from MinIO outside any DB transaction.
     d. Opens destroy txn:
          - SELECT ... FOR UPDATE SKIP LOCKED
          - DELETE FROM share_chunks WHERE share_id = $1
          - UPDATE shares (idempotent if already destroyed)
          - append_audit_entry('share_destroyed', share_id, payload)
     e. Commits.

4. v1.0 only:
   The reaper publishes the destruction-chain leaf to a public Merkle
   root anchor (e.g. an OpenTimestamps URL or a static JSON the offline
   verifier CLI can fetch). The current line keeps the chain in-database;
   tampering is detectable by the verify_audit_chain function (migration 0002)
   but the chain is not yet anchored externally.
```

After this:

- MinIO no longer has the encrypted blob
- Postgres no longer has the share row
- The destruction chain has a permanent record

## Why this is more than "deleted from the database"

A typical "delete" in a SaaS world means:

- The row is gone from the application database
- The blob is gone from primary storage
- ...but it's probably still in:
  - Hot backup (rolled forward over hours)
  - Cold backup (rolled forward over days)
  - Replication targets
  - Deleted-but-not-yet-overwritten disk sectors

For SlothBox the verification target is different. The system does not claim
to overwrite disk sectors (that's hardware-dependent). It claims:

- **The encryption key for this share is destroyed** (was never on the server
  to begin with — it was in the URL fragment)
- **The destruction is committed to a tamper-evident hash chain** at the time
  of the event. Today the chain lives in-database; the public external anchor
  that makes it verifiable without trusting the live database is v1.0.
- **Any future attempt to "undelete" by restoring backups would produce a
  contradiction** in the chain — the destruction entry's prev/entry hashes
  don't line up with a rolled-back state (in-database today; externally
  anchored in v1.0).

In other words: even if a future attacker restores the entire server backup,
they get ciphertext without keys. The keys never existed on the server. The
in-database chain records that the share was marked as destroyed and at what
time; the v1.0 public anchor turns that record into proof that doesn't depend
on trusting the live database.

## Verification flow (v1.0)

This is the flow once the public Merkle anchor lands. Today the chain is
in-database only, so steps 1-2 verify against the live database rather than an
external anchor.

```
auditor:
  destructionRecord = fetch_destruction_record(shareId)

  # 1. Verify the destruction record exists in the chain
  computed_root = compute_merkle_root(
    blake2b(destructionRecord),
    destructionRecord.merkleProof.leafIndex,
    destructionRecord.merkleProof.siblings
  )
  if computed_root != destructionRecord.merkleProof.rootHash:
    return "INVALID: not in destruction chain"

  # 2. Verify the published root anchor
  published = fetch(destructionRecord.merkleProof.rootAnchorUrl)
  if published != destructionRecord.merkleProof.rootHash:
    return "INVALID: root anchor mismatch"

  # 3. Verify the share is actually gone from the live service
  liveStatus = fetch("https://slothbox.philipsloth.com/api/shares/" + shareId)
  if liveStatus.status != "destroyed":
    return "INCONSISTENT: chain says destroyed, server still serves"

  return "VALID"
```

## What this does NOT claim

- It does not claim disk sectors are overwritten. We use the cloud
  provider's storage layer; physical destruction of NVMe sectors happens at
  their hardware level on volume detach, not synchronously on file unlink.
- It does not claim the file was never read by an attacker between upload
  and destruction. If your data was sensitive in transit, the v1.0 per-recipient
  encryption is the mitigation — only the intended recipient's key opens it.
- It does not retroactively destroy copies the recipient already saved. Once
  the recipient downloads, plaintext exists on their device. SlothBox is
  delivery-confidentiality, not endpoint DRM.

## Why this matters

The destruction chain inverts the usual retention story. Most file-handling
systems can prove that a record exists; few can prove that one no longer does.
SlothBox appends a tamper-evident chain entry at the moment a share is
destroyed, so a future inquiry can verify the destruction happened at the
claimed time. Today that verification reads the in-database chain; the v1.0
public anchor removes the live database from the trust path entirely.

For everyone else, it's a transparency layer — confirmation that "deleted"
actually meant "key destroyed; ciphertext mathematically unrecoverable" rather
than "soft-deleted in a database somewhere."

## Limits

- Destroy operations are irreversible. The system does not keep "soft-deleted"
  shares.
- The destruction chain is append-only. Genuine bugs in the destruction
  process (e.g. a chain entry for a share that wasn't actually destroyed)
  require a follow-up "correction" entry — the chain history itself remains
  public.
- The destruction chain depends on the service publishing Merkle roots. If
  the service shuts down, existing published roots remain verifiable as long
  as snapshots survive (Wayback Machine, archived audit dumps, etc.).
