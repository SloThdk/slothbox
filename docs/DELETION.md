# Verifiable Deletion

How SlothBox proves a file is gone, not just promises it. **Lands in v1.0.**

## Goal

When a file is destroyed (burn-after-read fires, expiry hits, or the sender
manually revokes), the sender can verify cryptographically that the encryption
key has been destroyed — meaning the ciphertext is mathematically
unrecoverable, even from server backups.

## How destruction works

```
1. Trigger fires (burn-after-read, expiry, manual revoke)
2. The reaper daemon:
   a. Generates a "destruction record" containing:
      - shareId
      - fileHash
      - destroyedAt (timestamp)
      - reason (burn / expiry / manual)
   b. Hashes the destruction record (BLAKE2b)
   c. Appends the hash to the destruction chain (database append-only table)
   d. Removes the ciphertext from MinIO (the actual blob)
   e. Removes the share row from Postgres
   f. Publishes the destruction-chain leaf to the public Merkle root
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
- **The destruction is committed to a public chain** at the time of the event
- **Any future attempt to "undelete" by restoring backups would produce a
  contradiction** in the chain — the destruction record is already public

In other words: even if a future attacker restores the entire server backup,
they get ciphertext without keys. The keys never existed on the server. The
destruction record is public proof that the share was marked as destroyed.

## Verification flow

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
SlothBox publishes a tamper-evident chain entry at the moment a share is
destroyed, so any future inquiry can verify the destruction happened at the
claimed time without the operator's word being load-bearing.

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
