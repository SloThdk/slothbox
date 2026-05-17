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

## [0.2.4] — 2026-05-18

Defence-in-depth hardening pass. Every loophole the v0.2 cold-eye
audit flagged that costs zero dollars to close is closed in this
release, plus a few additional headers / endpoint surfaces that
weren't audit findings but tighten the attack surface. No new
features; no behaviour change for legitimate flows. Audit-pending
status for v1.0 (external cryptographer review + third-party pen
test) is unchanged.

### Added

- **`TRUST_FORWARDED_FOR` env var** (audit Finding #5). Gates
  whether the rate-limiter trusts `X-Forwarded-For` for client-IP
  derivation. Default `true` (matches the canonical Caddy →
  api-gateway topology); set `false` if the gateway is ever
  exposed to untrusted clients via misconfigured port mapping or
  a second ingress that doesn't rewrite XFF. When `false`, the
  socket remote address is used, closing the rate-limit bypass
  via XFF spoof.
- **`shortId` regex constraint on all ingest chunk routes**
  (audit Finding #6). `PUT/GET/DELETE /chunk/{shortId}/{chunkIndex}`
  now reject anything that doesn't match the gateway's
  `SHORT_ID_ALPHABET` + `SHORT_ID_LENGTH=12` at the routing
  layer, before `BuildBlobKey` or MinIO is touched. The DB
  lookup still catches unknown ids, but defence-in-depth is now
  two-deep.
- **`POST /api/csp-report` endpoint** + `report-uri` directive
  in the web CSP. Browsers post Content-Security-Policy violation
  reports here; the gateway logs structured violation fields to
  pino (`{service="api-gateway"} |= "CSP violation"` in Loki
  catches XSS-attempt traffic). Rate-limited 60 reports / IP /
  minute. Accepts legacy `application/csp-report` AND modern
  Reports API shapes.
- **Origin guard middleware** on `/api/*`. CSRF defence-in-depth
  beyond CORS preflight: any state-changing method (POST / PUT /
  PATCH / DELETE) with an `Origin` header that doesn't match
  `API_CORS_ORIGIN` gets 403'd before the handler runs. Exempts
  `/api/csp-report` because browser CSP reports have their own
  origin semantics. Missing Origin is allowed (server-to-server
  calls and curl don't set one and the route's own auth gates
  handle them).
- **`MAX_PASSWORD_BYTES` cap (4 KiB)** in `deriveKeyFromPassword`.
  Hard ceiling on user-supplied password length, enforced AT BOTH
  the UTF-16 string length AND the UTF-8 encoded byte length so
  a 1500-char emoji password (4500 bytes) is rejected before
  Argon2id starts the slow KDF. Three new boundary tests
  (over-cap ASCII, over-cap multi-byte UTF-8, exactly-at-cap
  ASCII) added to the derivation test suite (60/60 green now,
  was 57/57).
- **`.well-known/security.txt` (RFC 9116)**. Standardised
  vulnerability-disclosure contact at the canonical URL.
  Security researchers and automated scanners read here before
  opening a public issue.
- **Web CSP `report-uri` directive** pointing at the new
  gateway endpoint. Closes the loop: when the browser blocks an
  XSS attempt via the nonce + strict-dynamic CSP, we now find
  out about it via Loki instead of silently.

### Changed

- **Caddy Permissions-Policy expanded** from 6 features to 31.
  Adds `accelerometer`, `ambient-light-sensor`, `autoplay`,
  `battery`, `display-capture`, `document-domain`,
  `encrypted-media`, `execution-while-not-rendered`,
  `execution-while-out-of-viewport`, `fullscreen=(self)`,
  `gamepad`, `gyroscope`, `hid`, `idle-detection`,
  `keyboard-map`, `magnetometer`, `midi`,
  `navigation-override`, `picture-in-picture`,
  `publickey-credentials-get`, `screen-wake-lock`, `serial`,
  `sync-xhr`, `web-share=(self)`, `xr-spatial-tracking`. Each
  feature this app doesn't use is now denied at the edge so a
  compromised script can't reach it.
- **Caddy `X-Permitted-Cross-Domain-Policies: none`** added.
  Blocks Adobe Flash / Reader cross-domain XML lookups — legacy
  but free hardening.
- **`apps/api-gateway/src/lib/logger.ts` redaction expanded**
  from 8 paths to 23. Now redacts `authorization`,
  `set-cookie`, `proxy-authorization`, `x-auth-token` headers;
  `req.body.{passwordSalt, revokeTokenHash, downloadTokenHash,
chunkTokens}`; wildcards `*.passwordKey`, `*.revokeToken`,
  `*.chunkToken`, `*.downloadToken`, `*.privateKey`,
  `*.apiKey`, `*.fragmentKey`, `*.aeadKey`. Belt-and-braces:
  the route code already avoids logging these, but this catches
  accidental future surfacing.
- **`apps/web/src/app/robots.ts`** — `/chunk/` and `/my-shares`
  added to the disallow list. `/chunk/` is the ingest service
  surface (no reason any crawler should walk it); `/my-shares`
  is device-local so its content is empty for crawlers but the
  path shouldn't show up in search results either.
- **Per-share password inputs** (`UploadDrop.tsx`, `Decrypt.tsx`)
  — explicit password-manager opt-out via `data-1p-ignore` +
  `data-lpignore` attributes. `Decrypt.tsx` password input also
  switched from `autoComplete="current-password"` to
  `autoComplete="off"`: it's a per-share out-of-band password,
  not the recipient's site credential.
- **GitHub repo security features enabled** (free tier):
  - Private vulnerability reporting (`PUT
/repos/{}/private-vulnerability-reporting`)
  - Dependabot security updates (auto-PR for security advisories)
  - Vulnerability alerts
  - Secret scanning + push protection (blocks committing
    obvious provider secrets)

### Security backlog explicitly tracked for later versions

The audit's remaining LOW + INFO findings still hold:

- **Streaming-Blob decryption** (Finding #3) — perf hazard on
  4 GB downloads. Lands in v0.5.
- **RLS enforcement** — gateway moves to non-owner role + `SET
LOCAL app.current_short_id` per request. Multi-day work; lands
  with the v0.5 auth introduction so the GUC plumbing is
  end-to-end.
- **Audit chain continuity checker** (Finding #9) — Postgres
  function + Prometheus alert rule. Lands with v1.0 verifiable-
  destruction-chain work.
- **`pids_limit` on the externally-reachable containers** —
  fork-bomb DoS defence. Needs per-service tuning; deferred to
  v0.3 / v0.5 once we have steady-state PID counts to budget
  against.
- **Magic-byte check on the first chunk** — operator-self-
  protection against a misconfigured client uploading plaintext.
  PipeReader peek + prepend dance adds complexity to the perf-
  critical upload path; not a v0.x release blocker.

## [0.2.3] — 2026-05-18

Brand-mark coherence patch. The favicon, apple-touch-icon, and
OG/social-preview image now render the same "box-with-keyhole"
glyph that the in-product Header Wordmark shows. The v0.2.2
favicon used a padlock-with-shackle that visually diverged from
the Header — the Header comment even claimed "Same glyph as the
favicon (kept in sync there)" but in practice they were two
different marks.

### Changed

- **Favicon** (`apps/web/src/app/icon.svg`) — switched from
  padlock-with-shackle to the box-outline + keyhole mark that
  Header Wordmark uses. Same coords (x=6 y=6 w=20 h=20 rx=3.5),
  stroke bumped from 1.6 to 2 so the outline survives 16x16
  favicon downscale.
- **Apple touch icon** (`apps/web/src/app/apple-icon.tsx`) — same
  glyph for iOS home-screen saves.
- **OG / social-preview image** (`apps/web/src/app/opengraph-image.tsx`)
  — same glyph so a link paste into Slack / Discord / X / LinkedIn
  shows the same mark as the favicon and the live Header.
- **Header Wordmark comment** (`apps/web/src/components/Header.tsx`)
  — updated to reflect the 3-surface brand-mark sync (Wordmark +
  favicon + apple/OG renderers) rather than the previous
  "same as the favicon" half-truth.

## [0.2.2] — 2026-05-17

First fully stable public release. `-alpha.1` suffix dropped from
all five workspace packages and both .NET assemblies. The v0.2
hardening model (per-share password + sender-revoke + single-use
chunk tokens + server-driven burn) has been cold-eye reviewed and
the one HIGH-impact race the audit surfaced is closed. Audit-pending
status remains honestly disclosed for v1.0.

### Added

- **First stable public release** — drops the `-alpha.1` suffix
  across all five workspace packages (`@slothbox/web`,
  `@slothbox/api-gateway`, `@slothbox/crypto-core`, `@slothbox/db`,
  workspace root) plus the `.NET` ingest + receipt assemblies.
- **visionOS-inspired brand refresh.** Icon SVG, manifest theme
  color, and OG/social-preview image now run on a deep slate
  background (`#0a0d14`) with a sky-blue accent (`#5b9eff`).
  Replaces the v0.1 graphite-and-gold pairing. New `apple-icon.tsx`
  adds a 180x180 PNG for iOS Safari home-screen saves.
- **Cold-eye audit report.** Internal `reviewer` subagent ran the
  full crypto-core + gateway + ingest + DB + infra + voice-shape
  pass. Verdict: APPROVE — 0 CRITICAL, 0 HIGH, 7 LOW, 5 INFO.
  Top-impact LOW (Finding #7) addressed in this release; remaining
  LOWs documented as v1.0 backlog (see below).

### Fixed

- **`mark_chunk_served` race window — single-use chunk-token bypass
  (audit Finding #7).** Previously, the SQL `mark_chunk_served`
  call ran AFTER `stream.CopyToAsync` completed, with the ambient
  request `CancellationToken`. A client that aborted the TCP
  connection mid-body could poison the mark — bytes already
  shipped, but `served_at` stayed NULL, and the same chunk became
  re-fetchable indefinitely. The single-use guarantee the v0.2
  marketing copy makes was bypassable for a determined attacker.
  Fix lives in `services/ingest/Endpoints/DownloadEndpoint.cs`:
  the byte stream is wrapped in a `try`/`finally`; the `finally`
  block, gated on `httpContext.Response.HasStarted`, commits the
  mark with `CancellationToken.None`. Bytes-leaving and
  mark-committing are now bound — the chunk is marked served
  exactly when "first body byte has flushed" is true, regardless
  of whether the stream finished cleanly. UX trade-off: a
  legitimate recipient who loses mid-stream cannot retry that
  chunk (sender re-shares). That's the literal semantic of
  "single use" and the conservative side of the trade for a
  security primitive.

### Removed

- **`<AlphaBanner />` dismissable pre-page banner**
  (`apps/web/src/components/AlphaBanner.tsx` + the four
  `alphaBanner.*` translation keys). The disclosure substance
  moves to the `[!NOTE]` block at the top of README + the
  `/security` page's audit-status table, both of which are
  honest about the v1.0 audit gap without the per-page UI
  friction.
- **Stale `v0.1.0-alpha` / `v0.2.0-alpha` version pins** across
  package.json files, in-product copy, health endpoints, .NET
  assembly metadata, and verifier-CLI skeleton messages. All
  five workspace packages and both .NET services now report
  `0.2.2` from `/healthz`.

### Changed

- **README WARNING block → `[!NOTE]` block.** Same audit-pending
  honesty (external cryptographer review + third-party pen test
  remain hard gates for v1.0), reframed from "alpha, do not use
  for sensitive data" to "first stable public release, hardened
  against the v0.1 URL-leak races, pre-v1.0 audit caveat surfaced
  where it matters."
- **Roadmap table.** v0.1.0-alpha and v0.2.0 both marked ✅
  shipped. v0.5.0 highlights refreshed to reflect that single-use
  chunk tokens already shipped in v0.2 (was previously listed as
  a v0.5 feature).
- **`SECURITY.md` headers block now reflects the actual emitted
  CSP** (audit Finding #1 — doc drift): the nonce +
  strict-dynamic CSP from `apps/web/src/middleware.ts` is
  rendered separately from the Caddy-emitted headers, with
  Permissions-Policy synced to include `usb=()` and
  `interest-cohort=()`.
- **README Grafana note** (audit Finding #2 — doc drift): the
  observability row no longer claims `/grafana` is reachable on
  the public domain. Grafana stays internal; the operator reaches
  it via SSH tunnel.
- **`how.roadmap.v05.body`** copy refreshed to drop the obsolete
  "single-use HMAC chunk tokens" line (those shipped in v0.2) and
  surface WAL-G continuous archiving + Stripe billing instead.

### Known issues — backlog tracked for v1.0

These are the LOW/INFO findings from the cold-eye audit that are
documented but not blocking the v0.2.0 release:

- **Plaintext memory pressure on large downloads** (Finding #3).
  `apps/web/src/lib/download.ts` holds the entire decrypted file in
  a `Uint8Array[]` before `new Blob`. At the 4 GB cap a recipient
  holds ≥8 GB transiently; mobile / low-RAM browsers OOM. Already
  on the v0.5 roadmap — migration to `TransformStream` pipelined
  into a streaming `Blob`.
- **`x-forwarded-for` unconditionally trusted** (Finding #5).
  Currently correct (Caddy is the only ingress) but fragile if a
  second ingress lands. Will pin XFF trust to a
  `TRUSTED_PROXY_CIDR` env var in v0.5.
- **Ingest `{shortId}` route param has no regex constraint**
  (Finding #6). DB lookup catches it but defence-in-depth is
  one-deep. Will land alongside the v0.5 ingest cleanup.
- **Audit chain append is fire-and-forget** (Finding #9). Already
  documented in `apps/api-gateway/src/routes/shares.ts:172-195`;
  v1.0's verifiable-destruction-chain work will add chain-continuity
  checks at the audit boundary.

## [0.2.1] — 2026-05-11

Tier-B (recipient + sender UX), Tier-D (operator transparency), and
Tier-E (operational hardening) on top of the v0.2.0 trust
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
  the single-use chunk-token semantics from v0.2 are not
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

[Unreleased]: https://github.com/SloThdk/slothbox/compare/v0.2.4...HEAD
[0.2.4]: https://github.com/SloThdk/slothbox/compare/v0.2.3...v0.2.4
[0.2.3]: https://github.com/SloThdk/slothbox/compare/v0.2.2...v0.2.3
[0.2.2]: https://github.com/SloThdk/slothbox/compare/v0.2.1...v0.2.2
[0.2.1]: https://github.com/SloThdk/slothbox/compare/v0.2.0-alpha.1...v0.2.1
[0.2.0-alpha.1]: https://github.com/SloThdk/slothbox/compare/v0.1.0-alpha.1...v0.2.0-alpha.1
[0.1.0-alpha.1]: https://github.com/SloThdk/slothbox/releases/tag/v0.1.0-alpha.1
