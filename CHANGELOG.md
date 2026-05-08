# Changelog

All notable changes to SlothBox are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and
the project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Planned for v0.5.0

- Lucia v3 / better-auth + Argon2id + magic-link primary
- Account dashboard with share history, manual revoke
- RFC 3161 timestamp receipt issuance
- Hash-chain audit log extension
- Stripe billing for free vs pro tiers
- Grafana dashboards published

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

[Unreleased]: https://github.com/SloThdk/slothbox/compare/v0.1.0-alpha.1...HEAD
[0.1.0-alpha.1]: https://github.com/SloThdk/slothbox/releases/tag/v0.1.0-alpha.1
