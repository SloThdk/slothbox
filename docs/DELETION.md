# Verifiable Deletion

How SlothBox proves a file is gone, not just promises it. **Lands in v1.0.**

## Goal

When a file is destroyed (burn-after-read fires, or expiry hits, or sender
manually revokes), the sender can verify cryptographically that the encryption
key has been destroyed — meaning the ciphertext is mathematically unrecoverable,
even from our backups.

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

## Why this is more than "we deleted it from our database"

A typical "delete" in a SaaS world means:

- The row is gone from the application database
- The blob is gone from primary storage
- ...but it's probably still in:
  - Hot backup (rolled forward over hours)
  - Cold backup (rolled forward over days)
  - Replication targets
  - Deleted-but-not-yet-overwritten disk sectors

For SlothBox the verification target is different. We don't claim to overwrite
disk sectors (that's hardware-dependent). We claim:

- **The encryption key for this share is destroyed** (was never on the server
  to begin with — it was in the URL fragment)
- **The destruction is committed to a public chain** at the time of the event
- **Any future attempt to "undelete" by restoring backups would produce a
  contradiction** in the chain — the destruction record is already public

In other words: even if a future attacker restores our entire backup, they get
ciphertext without keys. The keys never existed on the server. The destruction
record is public proof that the share was marked as destroyed.

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

For a regulated professional (the wedge audience):

- **Bogføringsloven** requires a 5-year retention chain. SlothBox proves
  destruction occurred at a specific time, which is the inverse — proof of
  end-of-life for transient documents.
- **GDPR Article 17** "right to erasure" requires a controller to delete
  personal data on request. SlothBox provides cryptographic proof that the
  encryption key for that data is destroyed.
- **Litigation hold** clients can prove that a specific document was, in fact,
  destroyed before a given date, blocking spoliation claims.

For everyone else, it's a nice-to-have transparency layer.

## Limits

- Once we destroy a share, it's irreversible. We don't keep "soft-deleted" shares.
- The destruction chain is append-only. Genuine bugs in the destruction process
  (e.g. a chain entry for a share that wasn't actually destroyed) require a
  follow-up "correction" entry — the chain history itself remains public.
- The destruction chain depends on our service publishing the Merkle root. If
  our service shuts down, the existing published roots remain verifiable as long
  as snapshots survive (Wayback Machine, archived audit dumps, etc.).
