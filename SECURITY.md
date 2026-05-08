# Security Policy

> **SlothBox is a security-critical project.** This file documents the
> security policy: the threat model, the disclosure process, what's audited,
> and what isn't. Read it before deploying SlothBox or trusting it with
> anything important.

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

## v0.1 trust assumption (READ FIRST)

**The `shortId` is the access secret in v0.1.** Anyone holding a share URL can:

- destroy the share (`POST /api/shares/:shortId/destroy`)
- download the ciphertext (`GET /chunk/:shortId/:chunkIndex` per chunk —
  the URL fragment `#key=…` is what unlocks plaintext, but anyone who
  has the full link including the fragment can decrypt)
- overwrite chunks during the upload window
  (`PUT /chunk/:shortId/:chunkIndex`)

There is no per-share owner token, no auth cookie, no signed timestamp on
these calls in v0.1. The mitigation is a 12-character random shortId with
~60 bits of entropy and aggressive rate limiting at the gateway and edge.

This is a **deliberate v0.1 trade-off**, not a bug. Per-share HMAC tokens
generated at create time and bound to the destroy / chunk-PUT / chunk-GET
routes land in **v0.5** alongside the Lucia auth + dashboard milestone (see
[`MILESTONES.md`](MILESTONES.md)). Until then:

- Treat share URLs the way you would treat a one-time-use door key: do not
  paste them into shared chat history, public Slack channels, ticketing
  comments, or anywhere else where a non-recipient might see them.
- Prefer short expiry windows (1 h / 24 h) over long ones for sensitive
  content — the smaller the time window in which a leaked URL is valid, the
  smaller the destruction-by-anyone exposure.
- For maximum-confidentiality use, send to a single recipient and follow
  up with a `POST /api/shares/:shortId/destroy` once they confirm receipt
  out-of-band — that closes the window even on shares you didn't mark
  burn-after-read.

### How burn-after-read works in v0.1 (post-migration 0004)

The trigger lives on the **server side**, not in the recipient's browser.
The ingest service (`services/ingest/Endpoints/DownloadEndpoint.cs`) calls
the `mark_chunk_served` SQL function (migration 0004) after every chunk is
successfully streamed back. When every chunk of a `burn_after_read=true`
share has been delivered at least once, that function atomically:

1. Flips `state` → `'destroyed'` on the parent share row (under a `FOR
UPDATE` lock, so parallel chunk completions can't race the decision).
2. Sets `destroyed_reason = 'burn'` and `destroyed_at = now()`.
3. Appends a `share_destroyed` audit-chain entry inside the same
   transaction so the destruction record is atomic with the state flip.
4. Returns the new audit-chain seq to the ingest endpoint for logging.

The reaper's existing 60-second sweep then deletes the MinIO ciphertext
blobs and the `share_chunks` rows on its next tick. During that window
the share is unfetchable: the gateway returns 404 for
`/api/shares/:shortId` (state='destroyed' fails the read policy), and
ingest returns 410 Gone for any further chunk fetch (`CanServeDownloads`
returns false for terminal states).

**What this defends against:** a hostile recipient — browser console
override, curl loop, non-browser HTTP client — who downloads the
ciphertext without cooperating with the gateway's legacy `/downloaded`
endpoint can no longer keep the share alive. The burn fires from the
server's view of "bytes left successfully", not from the client's
voluntary self-report.

**What this does NOT defend against in v0.1:** two simultaneous readers
in parallel — say a legitimate recipient AND a wiretap on transit who
both have the URL — can both complete their downloads if their chunk
fetches interleave such that no single reader is "the last" before the
other has all chunks. Once the first byte of a chunk leaves the server,
you can't unsend it. The defence against THAT case is single-use HMAC
chunk tokens (planned for v0.5 alongside the auth milestone). Until then,
treat the URL as a one-shot capability and trust the transmission channel
accordingly.

---

## Threat model

What SlothBox **does** protect against:

| Threat                                                   | Mitigation                                                                                                                                                                                           |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Server operator reads your file                          | Files are encrypted in the browser before upload using libsodium's XChaCha20-Poly1305. The server only ever stores ciphertext. The decryption key never reaches the server (lives in URL fragment).  |
| Server operator's database is breached                   | Same — attacker gets a pile of ciphertext blobs, no keys                                                                                                                                             |
| Network intercept (passive)                              | TLS 1.3 between every hop. URL fragments stay client-side regardless.                                                                                                                                |
| Network intercept (active MitM with valid cert)          | E2E encryption is independent of TLS — the file remains encrypted with the key the _original sender's_ browser generated, which the attacker never sees                                              |
| Stolen backup tape                                       | Backups contain only ciphertext + encryption-key metadata; no plaintext keys                                                                                                                         |
| Subpoena / legal compulsion                              | The operator can hand over ciphertext only — the keys never reach the server. Connection metadata is logged (IP, timestamp, share ID), and that scope is documented explicitly in the privacy policy |
| Malicious link click (phishing-style attack on receiver) | Receiver's browser still verifies the AEAD tag — tampered ciphertext fails to decrypt and produces an explicit error, not a wrong-but-plausible file                                                 |
| Cryptanalytic break of one primitive                     | The system uses modern, well-vetted primitives (XChaCha20-Poly1305, Curve25519, BLAKE2b, Argon2id). If any single one is broken, well-defined upgrade paths exist.                                   |

What SlothBox **does not** protect against (read this carefully):

| Out-of-scope threat                                             | Why                                                                                                                                                                                                                        |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Compromised sender's device                                     | If your machine is rooted, your file is plaintext on it before encryption. SlothBox can't help.                                                                                                                            |
| Compromised receiver's device                                   | Same on the other side.                                                                                                                                                                                                    |
| Malicious browser extension                                     | Extensions can read DOM and intercept the WebCrypto path. Treat browsers like any other untrusted environment.                                                                                                             |
| Side-channel attacks against libsodium primitives               | Best-effort: the system uses the constant-time primitives libsodium provides; full side-channel resistance requires hardware support outside the operator's control                                                        |
| Timing attacks against the server                               | Token comparisons use `crypto.timingSafeEqual` and are rate-limited; a determined attacker with millions of probes could still extract some info. Not an attack vector for the threats this system _does_ protect against. |
| State-level adversaries with court orders against your endpoint | If a Western intelligence agency wants your file and has compelled access to your laptop, you have a different problem than file transfer security.                                                                        |
| Quantum computers (Shor's algorithm against Curve25519)         | When a CRQC exists, the system will migrate to PQ primitives. The migration is deferred today because no audited PQ KEM has the maturity of Curve25519.                                                                    |
| Social engineering                                              | "Please give me the link" is not a SlothBox vulnerability.                                                                                                                                                                 |
| Recipient screenshots / leaks                                   | If a human receives the plaintext, they can screenshot it. SlothBox is delivery-confidentiality, not endpoint DRM.                                                                                                         |

For a longer threat model with attack trees, see [`docs/THREAT_MODEL.md`](docs/THREAT_MODEL.md).

---

## Reporting a vulnerability

**Please disclose responsibly.** Do not file a public GitHub issue for security
issues. Do not post to social media until the issue is fixed and a CVE (if
applicable) is assigned.

Two ways to send a private vulnerability report:

1. **Email** the maintainer directly at **<philipsloth1@gmail.com>**, OR
2. **Use the contact form** at <https://philipsloth.com/contact> — pick the
   "security" topic and the form routes the message to the same inbox.

Either route, please include:

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
- The deployed services at `slothbox.philipsloth.com` (the production reference deployment)

Out of scope for the **security** disclosure channel (different routes apply):

- Bugs in upstream dependencies (`libsodium`, `age`, `next`, etc.) — report
  those to the upstream project, not this repo.
- Denial-of-service attacks against the infrastructure (already rate-limited
  at the gateway and the edge).
- Social engineering attempts against the maintainer.
- **Abuse of the public service** (illegal content, harassment, spam, IP
  infringement) — these go through the **abuse** channel, not the security
  channel. Use the in-product form at <https://slothbox.philipsloth.com/abuse>,
  or contact the maintainer directly at <philipsloth1@gmail.com> or via
  <https://philipsloth.com/contact>. This is the EU DSA Article 16 notice
  mechanism; reports are reviewed within 24 hours and high-severity (CSAM,
  immediate-harm) prioritised same-day.

---

## Cryptographic code policy

Pull requests that touch `packages/crypto-core/` or any code that handles
encryption keys, IVs, salts, password hashing, or signature verification are held
to a higher bar:

1. **No new primitives without an audited reference implementation.** The
   repo uses libsodium and age. New ciphers, KDFs, or signature schemes
   are not accepted.
2. **Test vectors are mandatory.** If a change touches a wrapper, the
   existing test vectors must still pass and the PR must add new
   vectors covering the change.
3. **Maintainer review is required.** CODEOWNERS routes any change
   under `packages/crypto-core/` to the maintainer; a second reviewer
   with a cryptographic background is requested when one is available.
4. **PRs that "roll their own crypto" are closed during review.**

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
- **Postgres backups** — nightly `pg_dump` (gzipped) to a local Docker volume, 28-day rotation. v0.5 introduces WAL-G continuous archiving with an offsite copy; v0.1 keeps the simpler dump-and-rotate model so the restore drill is just `gunzip | psql`.
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
