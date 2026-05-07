# Cryptography

What primitives SlothBox uses, why, and what's audited.

## Hard rule

We use audited primitives only. We do not invent ciphers, KDFs, or signature
schemes. If you find an `XOR` or a hand-rolled hash function in this codebase,
file a bug — it shouldn't be here.

## Primitives in use (v0.1.0-alpha)

| Use                                | Algorithm                 | Library            | Where                     |
| ---------------------------------- | ------------------------- | ------------------ | ------------------------- |
| Symmetric authenticated encryption | XChaCha20-Poly1305 (AEAD) | libsodium-wrappers | browser → file encryption |
| Random key generation              | `randombytes_buf`         | libsodium-wrappers | browser → key per share   |
| Random IDs                         | `crypto.randomUUID()`     | Web Crypto         | browser → share IDs       |
| Hashing (file content addressing)  | BLAKE2b-256               | libsodium-wrappers | browser → integrity check |
| URL-safe encoding                  | base64url (RFC 4648 §5)   | small wrapper      | browser ↔ URL fragment    |

## Primitives planned (v0.5+)

| Use                                   | Algorithm                                 | Library                        | Where                 |
| ------------------------------------- | ----------------------------------------- | ------------------------------ | --------------------- |
| Password hashing (auth)               | Argon2id                                  | argon2-browser / libsodium-net | accounts              |
| Asymmetric encryption (per-recipient) | Curve25519 + XChaCha20-Poly1305 (via age) | age                            | v1.0 — recipient keys |
| Timestamp signatures                  | RFC 3161 (RSA / ECDSA)                    | Bouncy Castle (.NET)           | v0.5 — receipts       |
| Merkle hash chain                     | BLAKE2b-256                               | libsodium-net                  | v0.5 — audit log      |

## How encryption works (v0.1)

```
sender browser:
  key       = randombytes_buf(32)              // 256-bit key
  nonce_i   = randombytes_buf(24)              // per-chunk nonce
  ciphertext_i = crypto_aead_xchacha20poly1305_ietf_encrypt(
                   plaintext_chunk_i,
                   /* aad= */ shareId || chunkIndex,
                   nonce_i,
                   key
                 )
  upload(shareId, chunkIndex, nonce_i, ciphertext_i)
  shareUrl = "https://slothbox.com/s/" + shareId + "#" + base64url(key)

receiver browser:
  key = base64url_decode(window.location.hash.slice(1))
  for each chunk:
    plaintext_chunk_i = crypto_aead_xchacha20poly1305_ietf_decrypt(
                          ciphertext_i,
                          /* aad= */ shareId || chunkIndex,
                          nonce_i,
                          key
                        )
    write_to_blob(plaintext_chunk_i)
  download(reassembled_blob)
```

The associated data (AAD) binds each chunk to a specific share + chunk index, so
chunks cannot be silently reordered or moved between shares without producing a
verification failure on decryption.

## What the server can see

| Item                                   | Server can see?                                                         |
| -------------------------------------- | ----------------------------------------------------------------------- |
| Share ID                               | Yes (it issued the ID)                                                  |
| Encrypted chunks                       | Yes (it stores them)                                                    |
| Per-chunk nonces                       | Yes (stored alongside ciphertext)                                       |
| AAD                                    | Yes (computed from shareId + chunkIndex)                                |
| **Encryption key**                     | **No** — lives in URL fragment, never sent to server                    |
| **Plaintext file content**             | **No** — derived from ciphertext + key, both never co-located on server |
| **File name (original)**               | **No** — encrypted alongside content as part of metadata blob           |
| **File MIME type (real)**              | **No** — same                                                           |
| **Sender identity (anonymous shares)** | Only IP + User-Agent (rate limiting)                                    |

## What an attacker with the server's database gets

A pile of:

- `(shareId, chunkIndex, nonce, ciphertext, AAD)` tuples
- `(shareId, expiresAt, downloadCount, createdAt)` rows
- Connection metadata (IPs, timestamps)

To turn this into plaintext, the attacker needs the per-share encryption keys.
Those live in URL fragments which the server never sees, never logs, and never
stores.

## Test vectors

Each primitive is tested against published RFC vectors plus round-trip tests:

- XChaCha20-Poly1305 — IETF draft test vectors (`packages/crypto-core/tests/xchacha.test.ts`)
- BLAKE2b — RFC 7693 test vectors
- Argon2id — RFC 9106 test vectors (v0.5)

Tests must pass before any merge to `master`. CI fails if test vectors break.

## Library versions

Pinned in `pnpm-lock.yaml`:

- `libsodium-wrappers` — pinned to a specific patch version
- `age-encryption` (TS port) — v1.0+
- `argon2-browser` — v0.5+

Security patches via Dependabot. Major upgrades reviewed manually with re-running
of all test vectors.

## What we do NOT do

- We do not encrypt URL fragments server-side ("forwarding" them through us).
  The whole point is that we never see them.
- We do not log share URLs. We log share IDs.
- We do not implement "key escrow" or "lawful access". The architecture
  forbids it.
- We do not use deprecated primitives (MD5, SHA-1, RC4, DES, 3DES, RSA-PKCS1v15).
- We do not use random numbers from `Math.random()`.
- We do not concatenate strings to build cryptographic inputs (use proper KDFs).
