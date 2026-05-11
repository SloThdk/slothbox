# Changelog

All notable changes to SlothBox are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and
the project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Planned for v0.5.0

- Lucia v3 / better-auth + Argon2id + magic-link primary
- Account dashboard with server-side share history (complements the
  v0.2 device-local `/my-shares` page)
- RFC 3161 timestamp receipt issuance
- Hash-chain audit log extension
- Stripe billing for free vs pro tiers
- Grafana dashboards published

## [0.2.1] — 2026-05-11

Tier-B (recipient + sender UX), Tier-D (operator transparency), and
Tier-E (operational hardening) on top of the v0.2.0-alpha trust
upgrades.

### Added

- **Folder + multi-file uploads.** Sender drops a folder or many
  files; client packs them into a single zip (`fflate`, `level: 0`)
  and feeds the archive into the existing single-file encryption
  pipeline. Recipient downloads `<folder>.zip` and extracts on their
  OS. Path-traversal entries (`..`, leading `/`, NUL bytes) and
  duplicate paths are rejected at pack-time.
- **In-browser preview** for images, PDFs, plain text, and markdown
  on the receiver page. PDFs render in `<iframe sandbox="">` (no
  scripts allowed); markdown goes through `marked` v15 → HTML inside
  the same sandboxed iframe. Object URLs revoke on unmount. Files
  outside the previewable allowlist keep the v0.2 auto-save
  behaviour.
- **Installable PWA + offline-shell service worker.** New
  `app/manifest.ts` emits `/manifest.webmanifest`; new `public/sw.js`
  precaches the shell URLs and uses stale-while-revalidate for
  subsequent GETs. `/api/*` + `/chunk/*` are explicitly bypassed so
  the single-use chunk-token semantics from v0.2.0-alpha are not
  undermined by a cached 200.
- **`/transparency` page** — Schrems II evidence pack with operator
  legal entity, sub-processor inventory (zero non-EU in the data
  path), cookie policy (none), audit-status table, and concrete
  verification commands for visitors.
- **Optional age-encrypted Postgres dumps.** When
  `BACKUP_AGE_RECIPIENT` is set in the deploy env, each dump is
  age-encrypted before it touches the volume. Multiple recipients
  comma-separated for key redundancy. Operator runbook in
  `docs/BACKUP.md`.
- **Optional Tor hidden-service sidecar** behind a `tor` compose
  profile. v3 onion address points at internal `caddy:80`; default
  deployments stay public-only.

### Fixed

- `release.yml` no longer fails on every tag push. The verifier-CLI
  matrix build used `go build -o <file> ./...` against a multi-package
  module, which Go refuses (`cannot write multiple packages to
non-directory`). Switched to `.` so only the root main package
  builds, with `cmd/` and `internal/version/` pulled in as deps.

### Deliberate deferrals (tracked for v0.2.2 / v1.0)

- **Web Share Target API** in the manifest — requires non-trivial
  service-worker intercept of POST multipart/form-data.
- **Sigstore / cosign attestation on Docker images** — separate CI
  workflow PR.
- **DSA Article 16 notice-and-action endpoint** — pending Danish
  business-lawyer review of the procedural copy.
- **WAL-G continuous archiving** — sufficient at v0.2 dataset size to
  keep the nightly `pg_dump` story; full WAL-G lands with v0.5.

## [0.2.0-alpha.1] — 2026-05-11

### Added

- **Per-share password protection** (sender-opt-in). Argon2id stretches a
  user password to a 32-byte key, then a BLAKE2b-keyed combiner mixes it
  with the URL-fragment key into the AEAD key. The password never reaches
  the server; wrong guesses fail as AEAD-tag mismatches with no online
  oracle. Migration `0005_per_share_password.sql` adds four columns to
  `shares` (boolean + salt + ops/mem KDF params) with a cross-field
  CHECK constraint. Schema details in [`docs/CRYPTO.md`](docs/CRYPTO.md)
  §"How password-protected shares work".
- **Sender-revoke tokens** (always-on for new shares). 32-byte random
  token generated client-side, SHA-256 commitment shipped to the gateway,
  raw token persisted only in the sender's `localStorage` under
  `slothbox.myShares.v1`. The `/destroy` endpoint now requires
  `Authorization: Bearer <token>` and constant-time-compares the SHA-256
  hash of the incoming token. Migration `0006_sender_revoke_token.sql`
  adds `shares.revoke_token_hash bytea`.
- **`/my-shares` sender dashboard** — device-local list of shares this
  browser created, with per-row "Revoke now" (server hit) and
  "Remove from device only" (local-only) actions. Auto-prunes expired
  entries on mount.
- **Single-use chunk download tokens** (always-on for new uploads).
  Per-chunk SHA-256 token derived deterministically from the URL
  fragment + shortId + chunkIndex, presented as `Authorization: Bearer …`
  on the ingest GET path. Second arrival on the same chunk returns 410,
  closing the parallel-readers race acknowledged in the v0.1 WARNING
  block. Migration `0007_single_use_chunk_tokens.sql` adds
  `share_chunks.download_token_hash bytea`.
- New crypto-core helpers: `deriveKeyFromPassword` + `deriveAeadKey` in
  `packages/crypto-core/src/derivation.ts`; `deriveChunkToken` in
  `symmetric.ts`; `sha256` + `generateRevokeToken` in `utils.ts`.
- `apps/web/src/lib/myShares.ts` — versioned `localStorage` helper for
  the sender-side share registry.

### Changed

- Crypto-core dependency moved from `libsodium-wrappers` (slim) to
  `libsodium-wrappers-sumo` (superset that includes Argon2id /
  `crypto_pwhash`). The vitest + Next.js webpack aliases that worked
  around the slim build's broken ESM resolution are extended to the
  sumo build with the same shape; a `.d.ts` shim under each consumer's
  tsconfig scope re-exports `@types/libsodium-wrappers` so strict-mode
  source keeps compiling.
- `POST /api/shares/:shortId/destroy` is now token-gated. Legacy v0.1
  shares with NULL `revoke_token_hash` return 410 GONE; the legacy
  class shrinks to zero as TTLs elapse.
- `GET /chunk/:shortId/:chunkIndex` validates the chunk token before
  serving (when a hash is stored). Legacy v0.1 chunks with NULL hash
  serve under previous semantics for back-compat.
- README WARNING block shrunk from three paragraphs to one (external
  cryptographer review is still a v1.0 gate).

### Security

- 36 new test cases (21 derivation + 19 utils + 7 chunk-token); 57/57
  crypto-core tests green.
- Server never sees: passwords, raw revoke tokens, raw chunk tokens,
  Argon2id outputs. Server stores: salt + KDF params + SHA-256 hash of
  each capability — all uninvertible commitments.
- All bearer-token compares run through `crypto.timingSafeEqual`
  (gateway) / `CryptographicOperations.FixedTimeEquals` (ingest).

### Planned for v1.0.0

- Per-recipient asymmetric encryption via `age`
- Verifiable deletion proofs anchored to a public Merkle root
- Standalone offline verifier CLI (full feature)
- External cryptographer review and audit report under `/audits/`
- Public bug bounty program

### Planned for v1.1.0

- WebRTC P2P file transfer
- MitID OIDC for verified senders
- Time-locked / deadman's-switch shares
- Long-retention audit export (CSV / JSON) of share history

## [0.1.0-alpha.1] — 2026-05-07

### Added

- Initial scaffold of the v0.1.0-alpha public repository
- Monorepo with pnpm workspaces:
  - `apps/web` — Next.js 15 frontend
  - `apps/api-gateway` — Node + Hono API gateway
  - `services/ingest` — C# ASP.NET Core chunked upload service
  - `services/receipt` — C# ASP.NET Core receipt service skeleton (501 stubs)
  - `services/reaper` — Go expiry-sweep daemon
  - `tools/verify` — Go standalone verifier CLI skeleton
  - `packages/crypto-core` — libsodium + age wrappers
  - `packages/db` — Drizzle ORM + Postgres schema
- 14-service `docker-compose.yml` orchestrating frontend + backend + data layer + observability (the production overlay adds a 15th sidecar for `pg_dump` rotation)
- Postgres migrations with RLS, hash-chain audit table, and helper RPCs
- Cryptography wrappers using audited primitives only (`libsodium-wrappers-sumo`)
- WebCrypto-based browser encryption with key-in-URL-fragment pattern
- Burn-after-read and expiry mechanisms
- Caddy reverse proxy with strict CSP and security headers
- Self-hosted observability (Prometheus, Grafana, Loki, Promtail)
- Full GitHub Actions CI:
  - Typecheck, lint, test, build per workspace
  - .NET vulnerable-package scanning
  - `govulncheck`
  - `gitleaks` secret scanning
  - CodeQL static analysis (TS, C#, Go)
  - Trivy container image scanning
- Branch protection script for required signed commits + reviews + checks
- Pre-commit hooks (`gitleaks` + format)
- Dependabot for npm, NuGet, Go modules, Docker, Actions
- Documentation:
  - `README.md`, `SECURITY.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `MILESTONES.md`
  - `docs/ARCHITECTURE.md`, `docs/CRYPTO.md`, `docs/THREAT_MODEL.md`
  - `docs/RECEIPTS.md`, `docs/DELETION.md`, `docs/RUNBOOK.md`
  - 4 architecture decision records under `docs/adr/`
- MIT license

### Security

- Server-side cannot decrypt files — encryption key lives in URL fragment
- Audited cryptographic primitives only (no roll-your-own)
- Branch protection requires signed commits + CODEOWNERS review
- Push protection blocks committed secrets
- Nightly `pg_dump` (gzipped) backups with 28-day rotation on a local Docker volume (WAL-G + offsite + age land in v0.5)

### Known limitations (tracked for v0.5 / v1.0)

- No accounts / dashboard yet (anonymous shares only)
- RFC 3161 receipts return 501 Not Implemented
- Per-recipient encryption not yet implemented
- Standalone verifier CLI is a skeleton; full verification lands in v1.0
- WebRTC P2P transfer not yet implemented
- No external cryptographer review yet — see `SECURITY.md` audit status table

[Unreleased]: https://github.com/SloThdk/slothbox/compare/v0.2.0-alpha.1...HEAD
[0.2.0-alpha.1]: https://github.com/SloThdk/slothbox/compare/v0.1.0-alpha.1...v0.2.0-alpha.1
[0.1.0-alpha.1]: https://github.com/SloThdk/slothbox/releases/tag/v0.1.0-alpha.1
