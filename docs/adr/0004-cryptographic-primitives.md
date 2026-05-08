# ADR 0004 — Cryptographic primitives policy

**Status:** accepted
**Date:** 2026-05-07
**Authors:** Philip Sloth

## Context

The whole product hinges on the cryptography being right. A subtle bug — a
nonce reused, a key derived with weak parameters, a non-constant-time
comparison — would compromise every share. Building this on the wrong primitives
means rebuilding it later or shipping a security disaster.

## Decision

We use audited primitives only:

- **Symmetric authenticated encryption** — XChaCha20-Poly1305-IETF (libsodium)
- **Asymmetric encryption (v1.0+)** — `age` (Curve25519 + XChaCha20-Poly1305)
- **Password hashing** — Argon2id (libsodium's `crypto_pwhash`)
- **Hashing** — BLAKE2b-256 (libsodium's `crypto_generichash`)
- **Random** — libsodium's `randombytes_buf` (browser: WebCrypto-backed)
- **Cross-language interop** — same libsodium primitives work in browser
  (`libsodium-wrappers`), .NET (`libsodium-net`), and Go (`golang.org/x/crypto/...`)

What we forbid:

- Custom ciphers, KDFs, MACs, signature schemes
- Deprecated primitives (MD5, SHA-1, RC4, DES, 3DES, RSA-PKCS1v15)
- `Math.random()` for any purpose touching cryptography
- String concatenation as a substitute for proper KDFs
- Non-constant-time comparisons of secret values

The full policy is in `CONTRIBUTING.md` under "Cryptographic code: special
rules" and in `docs/CRYPTO.md`.

## Consequences

- Every cryptographic operation is a wrapper around an audited library
  function — no custom crypto in our codebase
- Library upgrades are reviewed manually with all test vectors re-run
- PRs that introduce new primitives are closed during maintainer review (CODEOWNERS routes any change under `packages/crypto-core/` to the maintainer)
- Test vectors against published RFC vectors are mandatory for each primitive
- Cross-language binary compatibility (browser ↔ .NET) requires careful
  testing; we maintain test vectors in both languages

## Alternatives considered

- **Roll our own AEAD** — instant security disaster, never even close to
  acceptable
- **Use WebCrypto only (no libsodium)** — WebCrypto is fine for AES-GCM and
  HMAC, but lacks XChaCha20-Poly1305 (which has a longer nonce, better suited
  to random nonce generation per chunk) and has clunky APIs for chunked
  encryption. libsodium-wrappers is also audited.
- **Use `crypto-js`** — not constant-time, well-known issues, never an option
  for production cryptography
- **Use Web5 / DID / SCITT** — over-engineered for a file transfer service

## References

- libsodium: <https://libsodium.gitbook.io/doc/>
- age: <https://age-encryption.org/v1>
- Argon2id RFC 9106: <https://www.rfc-editor.org/rfc/rfc9106.html>
- See `docs/CRYPTO.md` for the per-primitive rationale
- See `CONTRIBUTING.md` for the code-policy enforcement
