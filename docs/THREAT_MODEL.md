# Threat Model

Adversaries we consider, what we protect against, and what's out of scope.

## Adversaries

| Adversary                           | Capabilities                                  | In scope?                                    |
| ----------------------------------- | --------------------------------------------- | -------------------------------------------- |
| **Curious server operator**         | Reads server filesystem, database, logs       | Yes — server cannot read files               |
| **External attacker (network)**     | Passive eavesdropping on internet traffic     | Yes — TLS + E2E                              |
| **External attacker (active MitM)** | Can present a forged TLS cert                 | Yes — E2E independent of TLS                 |
| **Server-side data thief**          | Steals the database backup                    | Yes — only ciphertext leaks                  |
| **Subpoena issuer**                 | Compels server operator to produce data       | Yes — server has only ciphertext             |
| **Malicious recipient**             | Receives the file legitimately, then leaks it | Out of scope — recipient has the plaintext   |
| **Compromised endpoint**            | Malware on sender's or recipient's device     | Out of scope                                 |
| **Quantum computer adversary**      | Breaks Curve25519 / X25519                    | Out of scope for v1.0 (PQ migration tracked) |

## Assets

| Asset                                | Protection level                                                    |
| ------------------------------------ | ------------------------------------------------------------------- |
| File plaintext                       | Highest — never reaches our server                                  |
| Encryption keys                      | Highest — generated client-side, in URL fragment                    |
| File metadata (filename, type, size) | High — encrypted alongside content                                  |
| Share IDs                            | Medium — public knowledge of an ID alone is useless without the key |
| Sender IP / User-Agent               | Low — logged for rate limiting, retained briefly                    |
| Account email (v0.5+)                | High — protected by RLS, hashed for lookups where possible          |
| Audit chain                          | Tamper-evident (Merkle hash chain)                                  |

## Trust boundaries

```
┌─────────────────────────────────────────────────────────┐
│ TRUSTED                                                 │
│   sender device + browser                               │
│   recipient device + browser                            │
│   audited libsodium / age primitives                    │
└─────────────────────────────────────────────────────────┘
                            │ TLS 1.3
┌─────────────────────────────────────────────────────────┐
│ SEMI-TRUSTED (best-effort)                              │
│   slothbox.com Caddy + reverse proxy                    │
└─────────────────────────────────────────────────────────┘
                            │ internal network
┌─────────────────────────────────────────────────────────┐
│ ASSUMED COMPROMISED for threat-modelling                │
│   Postgres database                                     │
│   MinIO blob storage                                    │
│   Server backups                                        │
│   The server operator (you, me, future maintainers)     │
└─────────────────────────────────────────────────────────┘
```

The bottom layer is treated as compromised by design: even if our server is
fully owned by an adversary, plaintext does not leak because plaintext was never
there.

## Specific attack scenarios

### Scenario: server operator wants to read a specific file

Operator has full access to:

- The MinIO bucket containing ciphertext blobs
- The Postgres database with shareId metadata
- All server logs

What operator does NOT have:

- The encryption key (lives in URL fragment, never sent or logged)
- A way to ask the user for it (URL fragments are client-side only)

Outcome: operator sees ciphertext only. File remains confidential.

### Scenario: subpoena for "all data on user X"

Server provides:

- Ciphertext blobs associated with user X's share IDs
- Connection metadata (IPs, timestamps)

Server cannot provide:

- Plaintext (we don't have it)
- Encryption keys (we don't have them)
- Recipient identities for anonymous shares

This is a feature, not a bug. We document it explicitly in our privacy policy.

### Scenario: tampered ciphertext

Attacker modifies a chunk in MinIO. When recipient downloads:

- AEAD verification fails (Poly1305 tag mismatch)
- Decryption errors out with an explicit failure
- Recipient sees "this file may be corrupted or tampered with"

No silent acceptance of modified content.

### Scenario: replay attack

Attacker captures a chunk from share A and substitutes it for a chunk in share B.

- AAD includes shareId + chunkIndex
- AEAD verification fails because AAD doesn't match
- Decryption errors out

No silent cross-share contamination.

### Scenario: leaked URL

If a share URL leaks (forwarded email, copy-paste error, whatever), anyone with
the URL can decrypt the file. This is the same risk as any link-based system.

Mitigations available to sender:

- Burn-after-read (single download, then ciphertext deleted)
- Short expiry (default 7 days, settable down to 1 hour)
- Optional password protection (v0.5+) — second factor independent of URL
- Per-recipient encryption (v1.0+) — only the intended recipient's key works

### Scenario: server compromised by APT

Attacker installs persistent malware on the server. Can:

- Read all ciphertext (already public, doesn't help)
- Modify the frontend served to users (this is the real risk)

This is the **subresource integrity attack**. Mitigations:

- Frontend code is open source — independent observers can verify the deployed
  bundle matches the published source
- Subresource Integrity (SRI) hashes on third-party scripts
- Strict CSP forbidding inline scripts
- Reproducible builds (planned for v1.0)

This is the limit of what server-side code can defend against. If you cannot
trust the publisher of the JavaScript that runs in your browser, you cannot trust
any web app — not just SlothBox.

## Out-of-scope threats (with reasons)

| Threat                                   | Why out of scope                                                                 |
| ---------------------------------------- | -------------------------------------------------------------------------------- |
| Malware on sender's device               | Pre-encryption plaintext is on the sender's machine. We can't help.              |
| Malicious browser extension              | Extensions run with full DOM access. Mitigation: use a hardened browser profile. |
| Recipient screenshots                    | The receiver has plaintext by definition. DRM is not in scope.                   |
| Side-channel attacks on libsodium        | Best-effort: we use the constant-time primitives the library provides.           |
| Hardware bus snooping                    | Out of scope for a web service.                                                  |
| Endpoint correlation by traffic analysis | We don't claim anonymity. Use Tor + a VPN if you need network anonymity.         |

## Audit history

This file evolves with audits. Currently no external audits have been completed.
v1.0 ships only after independent cryptographer review of `packages/crypto-core/`.
