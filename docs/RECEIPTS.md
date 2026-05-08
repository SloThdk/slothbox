# Delivery Receipts

How SlothBox produces tamper-evident delivery proofs without ever seeing your
file's content. **Lands in v0.5.**

## Goal

A signed, verifiable proof that:

- A specific file (identified by its hash) was retrieved
- At a specific time
- From a specific IP region (not the exact IP — coarse for privacy)

Without revealing what the file contained.

## Components

### RFC 3161 timestamp authority (TSA)

The IETF standard for trusted timestamps. We use **FreeTSA.org** for v0.5
(free, OSS-friendly). Production-grade SLA would use a paid TSA like DigiCert
or Sectigo.

A TSA receives a hash, signs a structure that says "this hash existed at time T",
and returns the signed token. The signature can be verified with the TSA's
public certificate.

### Hash chain

Every receipt becomes a leaf in a Merkle tree. The tree's root is committed
periodically (every 1000 receipts or every hour, whichever first) and published
to a read-only endpoint at `https://slothbox.philipsloth.com/audit/anchors`.

This means:

- Once a receipt is published, the receipt cannot be changed without being
  detected
- A receipt cannot be silently retracted
- An auditor can verify the chain locally

### Verifier CLI

A standalone Go binary (`slothbox-verify`) verifies receipts offline, without
contacting any SlothBox server. Install via brew/scoop/apt. The CLI:

- Takes a receipt file as input
- Verifies the TSA signature against the bundled TSA public cert
- Verifies the receipt is in the published Merkle root
- Reports "valid" / "invalid" with a clear reason

## Receipt format

JSON, as small as possible:

```
{
  "version": "1",
  "shareId": "ab3c4d5e",
  "fileHash": "blake2b-256:e8b0f4...",
  "fileSize": 4823104,
  "downloadedAt": "2026-05-07T14:23:11Z",
  "ipRegion": "EU-DK",
  "tsaToken": "<base64-encoded RFC 3161 token>",
  "merkleProof": {
    "leafIndex": 4827,
    "siblings": ["...", "...", "..."],
    "rootHash": "blake2b-256:9c47d8...",
    "rootAnchorUrl": "https://slothbox.philipsloth.com/audit/anchors/2026-05-07T14"
  }
}
```

## What the receipt proves

| Claim                                           | How it's proven                                      |
| ----------------------------------------------- | ---------------------------------------------------- |
| "A file with this hash was retrieved"           | The TSA signed over the hash                         |
| "Retrieved at this time (within TSA precision)" | TSA timestamp                                        |
| "From this IP region"                           | Coarse region logged + signed as part of the receipt |
| "The receipt was issued by SlothBox"            | TSA signature chains to the TSA's CA                 |
| "The receipt is in the public audit chain"      | Merkle proof + published root anchor                 |

What the receipt does NOT prove:

- The file's content (the hash doesn't reveal it)
- Who downloaded (just the IP region — for true identity, the v1.1 MitID
  integration adds verified-sender identity)
- That the recipient actually read the file (the system can prove the bytes
  were retrieved; the act of reading is opaque to the server)

## What the receipt is and isn't

The receipt is a technical artifact: an RFC 3161 timestamped signature over
the file hash, plus a Merkle proof anchored in a public chain. It is verifiable
by anyone with the bundled TSA cert and the verifier CLI.

What the receipt does:

- The TSA is an established RFC 3161 authority
- The Merkle root is published to a public endpoint at issuance time
- The verifier CLI is independent of any SlothBox server
- The cryptographic primitives are audited and documented

What the receipt is not:

- It is not legal certification of any kind
- It does not assert the recipient's identity (paired identity proof — Penneo,
  DocuSign, MitID — is a separate concern, out of scope for v0.5)
- It does not assert that the recipient acted on the file's content

## Verification flow

```
auditor:
  receipt = read_file("receipt.json")
  tsaCert = bundled_tsa_cert(receipt.tsaToken.issuer)

  # 1. Verify TSA signature
  if not verify_rfc3161(receipt.tsaToken, receipt.fileHash, tsaCert):
    return "INVALID: TSA signature failed"

  # 2. Verify Merkle inclusion
  computed_root = compute_merkle_root(
    receipt.fileHash,
    receipt.merkleProof.leafIndex,
    receipt.merkleProof.siblings
  )
  if computed_root != receipt.merkleProof.rootHash:
    return "INVALID: Merkle proof failed"

  # 3. Verify root anchor (online check, optional)
  if online:
    published = fetch(receipt.merkleProof.rootAnchorUrl)
    if published != receipt.merkleProof.rootHash:
      return "INVALID: root anchor mismatch — possible retroactive change"

  return "VALID"
```

Step 3 is what makes receipts tamper-evident: even if SlothBox wanted to
retroactively forge a receipt, the published Merkle root would have to match,
and that root has been public since issuance.

## Storage and retention

- Receipts are stored on the server forever (they're cheap — a few hundred bytes)
- Senders can download their receipts at any time via the dashboard
- The audit chain is published indefinitely — even if SlothBox shuts down, the
  published root anchors remain verifiable as long as the snapshot exists
  somewhere on the internet (Wayback Machine, etc.)

## Open questions for v1.0

- Anchoring Merkle roots to a public blockchain (Bitcoin OP_RETURN) for extra
  durability adds complexity. Decision deferred until real demand exists.
- A "private TSA" tier for clients who want their own TSA cert in the chain
  is on the table. Probably v1.5+.
