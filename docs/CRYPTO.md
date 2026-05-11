# Cryptography

What primitives SlothBox uses, why, and what's audited.

## Hard rule

We use audited primitives only. We do not invent ciphers, KDFs, or signature
schemes. If you find an `XOR` or a hand-rolled hash function in this codebase,
file a bug — it shouldn't be here.

## Primitives in use

| Use                                 | Algorithm                  | Library            | Where                                      | Since |
| ----------------------------------- | -------------------------- | ------------------ | ------------------------------------------ | ----- |
| Symmetric authenticated encryption  | XChaCha20-Poly1305 (AEAD)  | libsodium-wrappers | browser → file encryption                  | v0.1  |
| Random key generation               | `randombytes_buf`          | libsodium-wrappers | browser → key per share                    | v0.1  |
| Random IDs                          | `crypto.randomUUID()`      | Web Crypto         | browser → share IDs                        | v0.1  |
| Hashing (file content addressing)   | BLAKE2b-256                | libsodium-wrappers | browser → integrity check                  | v0.1  |
| Password stretching (per-share pwd) | Argon2id (`crypto_pwhash`) | libsodium-wrappers | browser → password-protected shares        | v0.2  |
| AEAD-key combiner (URL + password)  | BLAKE2b-keyed              | libsodium-wrappers | browser → password-protected shares        | v0.2  |
| Sender-revoke token generation      | `randombytes_buf` (32 B)   | libsodium-wrappers | browser → revoke token per share           | v0.2  |
| Sender-revoke token commitment      | SHA-256                    | Web Crypto / Node  | browser ↔ gateway → bearer hash compare    | v0.2  |
| Audit chain entry hash              | SHA-256                    | pgcrypto           | Postgres → tamper-evident chain (see note) | v0.1  |
| URL-safe encoding                   | base64url (RFC 4648 §5)    | small wrapper      | browser ↔ URL fragment                     | v0.1  |

> **Note on the audit chain hash.** v0.1 uses SHA-256 inside the
> `append_audit_entry` / `verify_audit_chain` Postgres functions because
> pgcrypto ships with stock Postgres and does not include BLAKE2. The
> v0.5 migration moves the chain logic to libsodium-net inside the
> receipt service so the receipt + the chain entry share the same
> BLAKE2b-256 hash, which is what the offline `slothbox-verify` CLI
> recomputes — see the v0.5+ table below. SHA-256 is a perfectly fine
> tamper-evidence hash on its own; the migration is about end-to-end
> algorithm consistency, not a security upgrade.

## Primitives planned (v0.5+)

| Use                                   | Algorithm                                 | Library              | Where                 |
| ------------------------------------- | ----------------------------------------- | -------------------- | --------------------- |
| Single-use chunk tokens               | HMAC-SHA-256                              | Web Crypto           | v0.2 — burn-race fix  |
| Account password hashing              | Argon2id                                  | libsodium-wrappers   | v0.5 — Lucia accounts |
| Asymmetric encryption (per-recipient) | Curve25519 + XChaCha20-Poly1305 (via age) | age                  | v1.0 — recipient keys |
| Timestamp signatures                  | RFC 3161 (RSA / ECDSA)                    | Bouncy Castle (.NET) | v0.5 — receipts       |
| Merkle hash chain                     | BLAKE2b-256                               | libsodium-net        | v0.5 — audit log      |

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
  shareUrl = "https://slothbox.philipsloth.com/s/" + shareId + "#" + base64url(key)

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

## How password-protected shares work (v0.2)

The sender optionally sets a password. The password becomes a second
factor on top of the URL fragment — neither alone is enough to decrypt.

```
sender browser:
  fragment_key = randombytes_buf(32)          // URL fragment, never sent
  salt         = randombytes_buf(16)          // per-share, sent to server
  pwd_key      = crypto_pwhash(               // Argon2id
                   /* out_len  = */ 32,
                   /* password = */ password,
                   /* salt     = */ salt,
                   /* ops      = */ 3,        // libsodium MODERATE
                   /* mem      = */ 64 MiB,   // libsodium MODERATE
                   /* alg      = */ ARGON2ID13
                 )
  aead_key     = crypto_generichash(          // BLAKE2b-keyed
                   /* out_len = */ 32,
                   /* message = */ "slothbox-aead-kdf-v1" || 0x00 || pwd_key,
                   /* key     = */ fragment_key
                 )
  // Every chunk + the metadata blob is then encrypted under aead_key
  // exactly as in v0.1 — the only difference is that aead_key is no
  // longer equal to fragment_key.

  POST /api/shares { ...,
    passwordProtected: true,
    passwordSalt: base64url(salt),
    passwordKdfOpsLimit: 3,
    passwordKdfMemLimitKib: 65536
  }

receiver browser:
  // 1. Fetch metadata. password.enabled tells us to prompt the user.
  descriptor = GET /api/shares/{shortId}
  password   = prompt(user)

  // 2. Re-run Argon2id with the server-stored salt + KDF params.
  pwd_key  = crypto_pwhash(32, password, descriptor.password.salt,
                           descriptor.password.opsLimit,
                           descriptor.password.memLimitKib * 1024,
                           ARGON2ID13)

  // 3. Combine with the URL fragment.
  aead_key = crypto_generichash(32,
               "slothbox-aead-kdf-v1" || 0x00 || pwd_key,
               fragment_key)

  // 4. Decrypt metadata blob FIRST. Wrong password fails the AEAD tag
  //    here — before any chunk is fetched — so a wrong-password attempt
  //    cannot trigger burn-after-read by accidentally serving chunks.
  meta = decryptChunk(descriptor.encryptedMeta, aead_key, descriptor.nonceMeta,
                      aad=AAD("meta", 0))

  // 5. If metadata decrypted, proceed with chunk loop as in v0.1.
```

### Why this construction

- **Both factors required.** An attacker with only the URL (forwarded
  screenshot, browser-history sync, chat-log scrape) cannot brute-force
  the password offline through the BLAKE2b stage — Argon2id outputs are
  256-bit uniform random and BLAKE2b is a PRF. An attacker with only
  the password (no URL) cannot derive `aead_key` without the 256-bit
  fragment.
- **No online guess oracle.** The server never sees the password and
  never validates it — wrong guesses look identical to a corrupted
  ciphertext (AEAD tag mismatch). An attacker who steals the ciphertext
  and wants to brute-force the password still has to pay one Argon2id
  derivation per guess locally (~250 ms on a 2022 laptop at the
  defaults). 64 MiB of memory per attempt makes massively-parallel GPU
  attacks expensive.
- **Domain-separated.** The string `"slothbox-aead-kdf-v1"` is baked into
  the BLAKE2b input so a future construction change can never produce
  the same key from the same `(fragment_key, pwd_key)` pair. The `v1`
  here ticks independently of the SemVer release — it changes only when
  the KDF construction itself changes.
- **Per-share salt.** Each password-protected share gets a fresh 16-byte
  salt. Rainbow-table attacks across shares are blocked even when the
  same password is reused.
- **KDF parameters stored on the row.** If we bump the default
  `opsLimit` / `memLimit` later, existing shares keep working — each
  share's row remembers the parameters it was created with. The library
  re-derives with those exact values during decrypt.

### What goes over the wire

| Item                  | Sent to server? | Visible in URL fragment? |
| --------------------- | --------------- | ------------------------ |
| `password` (string)   | Never           | Never                    |
| `salt`                | Yes (bytea col) | No                       |
| `opsLimit`/`memLimit` | Yes             | No                       |
| `pwd_key` (Argon2id)  | Never           | Never                    |
| `aead_key` (combined) | Never           | Never                    |
| `fragment_key`        | Never           | Yes (`#key=…`)           |
| Ciphertext            | Yes (MinIO)     | No                       |

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

- XChaCha20-Poly1305 — round-trip + tampered-ciphertext + wrong-AAD tests
  (`packages/crypto-core/tests/symmetric.test.ts`); IETF draft fixed
  vectors land alongside the v0.5 cryptographer review.
- BLAKE2b — exercised through hash determinism + the AEAD-key combiner
  (`packages/crypto-core/tests/derivation.test.ts`); RFC 7693 vectors
  pending v0.5.
- Argon2id — round-trip + cross-salt isolation + wrong-password failure
  tests (`packages/crypto-core/tests/derivation.test.ts`); RFC 9106
  vectors pending v0.5.

Tests must pass before any merge to `master`. CI fails if test vectors break.

## Library versions

Pinned in `pnpm-lock.yaml`:

- `libsodium-wrappers` — pinned to a specific patch version. Covers
  XChaCha20-Poly1305, BLAKE2b (incl. keyed mode), and Argon2id —
  password-protected shares depend on this single dep, no separate
  `argon2-browser` needed.
- `age-encryption` (TS port) — v1.0+ (per-recipient asymmetric)

Security patches via Dependabot. Major upgrades reviewed manually with re-running
of all test vectors.

## What this design does NOT do

- The system does not encrypt URL fragments server-side ("forwarding" them
  through the operator). The entire point is that the operator never sees
  them.
- The system does not log share URLs. It logs share IDs only.
- The system does not implement "key escrow" or "lawful access". The
  architecture forbids it — keys are not on the server to escrow.
- The system does not use deprecated primitives (MD5, SHA-1, RC4, DES, 3DES,
  RSA-PKCS1v15).
- The system does not use random numbers from `Math.random()` for any
  security-relevant value.
- The system does not concatenate strings to build cryptographic inputs —
  proper KDFs and length-prefixed AAD only.
