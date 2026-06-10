# SlothBox — Account-less Feature Backlog

The product principle: **no accounts.** Every feature here works for an
anonymous sender and an anonymous recipient, with the decryption key living in
the URL fragment and never reaching the server. Anything that needs identity,
billing, or a logged-in dashboard is deliberately **out of scope** (see the
bottom of this file) — those belong to a different product shape than the one
SlothBox is.

Effort is a rough order of magnitude for a solo dev. "Backend" means the
feature can only be tested with the full Docker stack up (`docker compose up
-d`), not `next dev` alone — it touches the gateway, ingest, MinIO, or the DB.

---

## Shipped

Already live (earlier releases): per-share password (Argon2id + BLAKE2b),
sender-revoke tokens, single-use chunk tokens, folder / multi-file upload,
in-browser preview, burn-after-read, expiry windows, PWA, age-encrypted
operator backups.

- **Password generator + strength meter + reveal toggle** — one-click CSPRNG
  password (≈120 bits), a three-segment strength bar, and a show/hide eye on
  the field (the per-share password is out-of-band material, so revealing it
  is the common case, not a leak).
- **Paste-to-encrypt** — paste a copied file or a screenshot straight into the
  drop zone; it encrypts and uploads like a drop. Plain-text paste is reserved
  for text-note mode (below).
- **Bigger brand mark** — the cube logo scaled up in the full-width header so
  the mark reads custom, not templated.

---

## Next — high value, account-less, mostly self-contained

| Feature                                       | Why                                                                                                                                                                                                                                                                 | Effort | Backend            |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ------------------ |
| **Text / "secret note" mode**                 | The single most-common account-less need: share a password, API key, or message securely. Toggle File ⇄ Text; text is encrypted as bytes through the existing pipeline; recipient sees it inline with a copy button + burn-after-read. **The flagship next build.** | M      | yes (round-trip)   |
| **QR code on the share link**                 | Phone-to-phone hand-off — show a QR of the share URL on the "done" screen. Tiny zero-dep generator, no new trust surface.                                                                                                                                           | S      | shows post-upload  |
| **Max-downloads (N-views) limit**             | Generalises burn-after-read: "this link works 3 times, then it's gone." Server-enforced via the chunk-token ledger.                                                                                                                                                 | M      | yes (gateway + DB) |
| **Copy-decrypted-text on the recipient side** | Pairs with text mode — recipient gets a one-tap copy instead of a forced file download for small text payloads.                                                                                                                                                     | S      | yes (round-trip)   |
| **Drag-anywhere overlay**                     | Whole-window drop target with a full-screen "drop to encrypt" overlay, not just the card.                                                                                                                                                                           | S      | no                 |

---

## Crypto flagships — deep, each a dedicated build + cold-eye review

These are the portfolio-defining features. Each one is its own focused build
with a round-trip test and a security pass — **not** a same-session add.

| Feature                                     | Why it's wild                                                                                                                               | Effort |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| **Post-quantum hybrid encryption**          | X25519 + ML-KEM (Kyber) key path. "Quantum-resistant E2EE file transfer" is a real, defensible 2026 headline and a one-line README flex.    | L      |
| **M-of-N recipients (Shamir)**              | Split the key so the file unlocks only when _k of n_ recipients combine fragments. "Unlocks when 3 of 5 agree."                             | L      |
| **Cryptographic time-lock (drand `tlock`)** | Upgrade the planned time-lock from server-policy to _cryptographically impossible_ to open before date T — the server cannot cheat.         | L      |
| **Per-recipient `age` sealed-boxes**        | Encrypt to a recipient's public key, not just the URL fragment. Account-less: the recipient generates a keypair and shares the public half. | L      |

---

## Verifiability — the trust differentiators

| Feature                           | Why                                                                                                                                                                                                                                                                                                          | Effort |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ |
| **Code / binary transparency**    | Closes the fundamental hole in _all_ web E2EE: "how do I know the server served honest crypto JS?" Signed release manifest + SRI + an independent monitor that checks the served bundle hash against the open-source commit (cf. WhatsApp Code Verify). The most credible trust feature SlothBox could ship. | L      |
| **RFC 3161 timestamped receipts** | Tamper-evident proof that _something with this hash was retrieved at time T_, without revealing the content. Issuable + verifiable anonymously.                                                                                                                                                              | M      |
| **Standalone verifier CLI**       | Offline verification of receipts and deletion proofs, no live service needed. Skeleton already exists in `tools/verify`.                                                                                                                                                                                     | M      |

---

## Wild / infrastructure

| Feature                                 | Why                                                                                                                                                               | Effort |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| **Tor onion-service mirror**            | A `.onion` in the compose stack — censorship-resistant access, squarely on the privacy thesis.                                                                    | M      |
| **Air-gapped self-contained decryptor** | Export a share as one standalone HTML file with the WASM crypto embedded; the recipient decrypts without ever touching the server.                                | M      |
| **WebRTC P2P transfer**                 | Browser-to-browser when both endpoints are online; the server relays only signalling.                                                                             | L      |
| **Dead-man's switch**                   | Release a file to a recipient if the sender doesn't check in within N days — whistleblower / journalist use case. Heartbeat tied to the revoke token, no account. | M      |

---

## Explicitly out of scope (decided 2026-06-06)

Not features SlothBox will add — they change the product into an account-based
SaaS, which is a different thing:

- User accounts / auth (Lucia, magic-link, passwords)
- Logged-in dashboard / server-side share history
- Stripe billing / paid tiers
- MitID / verified-sender identity

The strength of SlothBox is that none of the above is required to send a file
securely. Keep it that way.
