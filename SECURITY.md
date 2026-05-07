# Security Policy

> **SlothBox is a security-critical project.** This file documents how we treat
> security: the threat model, the disclosure process, what's audited, and what
> isn't. Read this before deploying SlothBox or trusting it with anything important.

---

## Audit status

| Component                                               | Last audit | Auditor                                     | Result                               |
| ------------------------------------------------------- | ---------- | ------------------------------------------- | ------------------------------------ |
| `libsodium` (browser primitives)                        | ongoing    | Cryptography Engineering, NCC Group, others | ✅ Audited upstream                  |
| `age` (asymmetric primitives)                           | 2022       | NCC Group                                   | ✅ Audited upstream (used in v1.0+)  |
| `argon2-browser`                                        | upstream   | community                                   | ✅ Audited upstream                  |
| **SlothBox integration code** (`packages/crypto-core/`) | —          | —                                           | ❌ **Not yet independently audited** |
| **API gateway auth + rate limiting**                    | —          | —                                           | ❌ Not yet pen-tested                |
| **Postgres RLS policies**                               | —          | —                                           | ❌ Not yet pen-tested                |

**Until v1.0 ships and includes the integration audit report under `/audits/`,
SlothBox is appropriate for portfolio review and personal experimentation only.**

---

## Threat model

What SlothBox **does** protect against:

| Threat                                                   | Mitigation                                                                                                                                                                                          |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Server operator reads your file                          | Files are encrypted in the browser before upload using libsodium's XChaCha20-Poly1305. The server only ever stores ciphertext. The decryption key never reaches the server (lives in URL fragment). |
| Server operator's database is breached                   | Same — attacker gets a pile of ciphertext blobs, no keys                                                                                                                                            |
| Network intercept (passive)                              | TLS 1.3 between every hop. URL fragments stay client-side regardless.                                                                                                                               |
| Network intercept (active MitM with valid cert)          | E2E encryption is independent of TLS — the file remains encrypted with the key the _original sender's_ browser generated, which the attacker never sees                                             |
| Stolen backup tape                                       | Backups contain only ciphertext + encryption-key metadata; no plaintext keys                                                                                                                        |
| Subpoena / legal compulsion                              | We can hand over ciphertext. We do not have the keys. We log connection metadata only (IP, timestamp, share ID) — and document it explicitly in our privacy policy                                  |
| Malicious link click (phishing-style attack on receiver) | Receiver's browser still verifies the AEAD tag — tampered ciphertext fails to decrypt and produces an explicit error, not a wrong-but-plausible file                                                |
| Cryptanalytic break of one primitive                     | We use modern, well-vetted primitives (XChaCha20-Poly1305, Curve25519, BLAKE2b, Argon2id). If any single primitive is broken, well-defined upgrade paths exist.                                     |

What SlothBox **does not** protect against (read this carefully):

| Out-of-scope threat                                             | Why                                                                                                                                                                                                                    |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Compromised sender's device                                     | If your machine is rooted, your file is plaintext on it before encryption. SlothBox can't help.                                                                                                                        |
| Compromised receiver's device                                   | Same on the other side.                                                                                                                                                                                                |
| Malicious browser extension                                     | Extensions can read DOM and intercept the WebCrypto path. Treat browsers like any other untrusted environment.                                                                                                         |
| Side-channel attacks against libsodium primitives               | Best-effort: we use the constant-time primitives libsodium provides; full side-channel resistance requires hardware support we don't control                                                                           |
| Timing attacks against the server                               | We use `crypto.timingSafeEqual` for any token comparison; rate-limited; but a determined attacker with millions of probes could still extract some info. Not an attack vector for the threats we _do_ protect against. |
| State-level adversaries with court orders against your endpoint | If a Western intelligence agency wants your file and has compelled access to your laptop, you have a different problem than file transfer security.                                                                    |
| Quantum computers (Shor's algorithm against Curve25519)         | When a CRQC exists, we will migrate to PQ primitives. We are not migrating now because no audited PQ KEM has the maturity of Curve25519.                                                                               |
| Social engineering                                              | "Please give me the link" is not a SlothBox vulnerability.                                                                                                                                                             |
| Recipient screenshots / leaks                                   | If a human receives the plaintext, they can screenshot it. SlothBox is delivery-confidentiality, not endpoint DRM.                                                                                                     |

For a longer threat model with attack trees, see [`docs/THREAT_MODEL.md`](docs/THREAT_MODEL.md).

---

## Reporting a vulnerability

**Please disclose responsibly.** Do not file a public GitHub issue for security
issues. Do not post to social media until the issue is fixed and a CVE (if
applicable) is assigned.

Email **security@philipsloth.com** with:

- A description of the vulnerability
- Reproducible steps or proof-of-concept
- Impact assessment (what an attacker can achieve)
- Your name / handle for credit (optional)

For sensitive reports, encrypt to the PGP key fingerprint:

```
TO BE GENERATED — see https://philipsloth.com/.well-known/security.txt
```

(PGP key will be published before the public launch of v0.1.)

### What to expect

| Stage                  | Timeline                                                  |
| ---------------------- | --------------------------------------------------------- |
| Acknowledgement        | Within 72 hours                                           |
| Initial assessment     | Within 7 days                                             |
| Fix or mitigation plan | Within 30 days for high/critical, best-effort otherwise   |
| Public disclosure      | Coordinated with you, default 90 days from initial report |
| Hall of fame entry     | After fix lands, with your consent                        |

### Scope

In scope:

- This repository's code (anything under `apps/`, `services/`, `packages/`,
  `db/migrations/`, `infra/`, `tools/`)
- The deployed services at `slothbox.com` (when live)

Out of scope:

- Bugs in upstream dependencies (`libsodium`, `age`, `next`, etc.) — report
  those to the upstream project, not us
- Denial-of-service attacks against our infrastructure (we've already rate-limited)
- Social engineering attempts against the maintainer
- Spam / abuse of the public service that doesn't compromise other users' files

---

## Cryptographic code policy

Pull requests that touch `packages/crypto-core/` or any code that handles
encryption keys, IVs, salts, password hashing, or signature verification are held
to a higher bar:

1. **No new primitives without an audited reference implementation.** We use
   libsodium and age. We do not add new ciphers, KDFs, or signature schemes.
2. **Test vectors are mandatory.** If you change a wrapper, the existing test
   vectors must still pass and you must add new test vectors covering your change.
3. **Maintainer review is required.** A second independent reviewer (preferably
   someone with cryptographic background) is encouraged.
4. **PRs that "roll their own crypto" are auto-closed.** No exceptions.

See [`docs/CRYPTO.md`](docs/CRYPTO.md) for what is and isn't audited.

---

## Operational security

We follow these practices for the deployed service:

- **Secrets via environment variables only** — never committed, never logged
- **Pre-commit `gitleaks` hook** plus GitHub secret scanning + push protection
- **CI runs `npm audit`, `dotnet list package --vulnerable`, `govulncheck`,
  `trivy fs`, `gitleaks detect`** on every push; high/critical findings block merge
- **Branch protection** on `master`: required signed commits, required PR review,
  required status checks, no force push, no direct push
- **Dependency updates** via Dependabot for security updates (daily) and
  patch/minor updates (weekly). Major updates manually reviewed.
- **Container image scanning** — `trivy image` on every Docker build in CI
- **Postgres backups** — WAL-G with encrypted offsite copy to provider block storage
- **TLS** — Caddy with auto-renewing Let's Encrypt certs, TLS 1.3 only

---

## Security headers (sent by Caddy)

```
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
Content-Security-Policy: default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' wss:; frame-ancestors 'none'; form-action 'self'; base-uri 'self'
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Referrer-Policy: no-referrer
Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()
Cross-Origin-Embedder-Policy: require-corp
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Resource-Policy: same-origin
```

WASM is allowed (`wasm-unsafe-eval`) because libsodium-wrappers requires it.
There is no inline script (`'unsafe-inline'` is for styles only — Tailwind v4
generates inline `<style>` for some utilities).

---

## Known issues / accepted risks

| Issue                                             | Status                                                                           | Tracking |
| ------------------------------------------------- | -------------------------------------------------------------------------------- | -------- |
| RFC 3161 receipts use FreeTSA.org in v0.5         | Accepted for portfolio scope; switch to paid TSA before any production-grade SLA | TBD      |
| WebCrypto + libsodium-wrappers requires WASM eval | Mitigated by CSP allowing only `wasm-unsafe-eval`, no `unsafe-eval`              | —        |
| No HSM for key destruction proofs                 | Hash chain is software-only; HSM is future work                                  | —        |

---

## Audit history

This file is updated as audits land. Currently empty pending v1.0 review.

```
TBD
```

---

_Last updated: scaffold of v0.1.0-alpha._
