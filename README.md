# SlothBox

> **End-to-end encrypted file transfer with court-admissible delivery receipts. The server cannot decrypt anything — verify the math yourself.**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![CI](https://img.shields.io/badge/CI-pending-lightgrey)](https://github.com/SloThdk/slothbox/actions)
[![Crypto: libsodium + age](https://img.shields.io/badge/crypto-libsodium%20%2B%20age-brightgreen)](docs/CRYPTO.md)
[![Status: v0.1.0-alpha](https://img.shields.io/badge/status-v0.1.0--alpha-orange)](MILESTONES.md)
[![EU-hosted: Hetzner DE](<https://img.shields.io/badge/region-EU%20(Hetzner%20DE)-blue>)](#why-eu-hosted)

> [!WARNING]
> **v0.1.0-alpha is a portfolio reference build.** The underlying cryptographic primitives
> (libsodium, age) are battle-tested, but the SlothBox integration has **not** yet been
> independently audited. Do not use for high-stakes secrets until v1.0 + external
> cryptographer review (see [`SECURITY.md`](SECURITY.md)).

---

## What is SlothBox

Most "send a file" services scan your file or keep a copy. SlothBox can't.

You drop a file onto **slothbox.com**. Your browser locks it with a key it generates on
the spot, before any byte leaves your computer. The locked blob uploads to our server.
You get a link to share. The unlock key lives in the part of the URL after `#` —
which **browsers never send to the server**, by design. We have a locked file we
cannot open and no idea what's in it.

That's the whole product. Everything else (delivery receipts, deletion proofs, P2P
fallback, MitID for verified senders) is built on top.

---

## Why this exists

| Existing service   | Issue                                                                             |
| ------------------ | --------------------------------------------------------------------------------- |
| WeTransfer         | Scans your file, keeps a copy, monetises via ads                                  |
| Dropbox Transfer   | Reads your content; US-cloud (Schrems II problem for EU users)                    |
| Google Drive share | Same                                                                              |
| Wormhole.app       | E2E encrypted but closed-source; no delivery proof                                |
| ProtonDrive        | E2E encrypted but paid, account-only, no quick-share, no court-admissible receipt |
| Registered mail    | Paper, days, no encryption inside the envelope                                    |

There is no **EU-hosted, open-source, end-to-end encrypted file transfer with
cryptographic delivery receipts** product. SlothBox aims at that gap, with a focus on
**regulated professions** (lawyers, accountants, journalists, doctors) where both
confidentiality (`tavshedspligt`) and provable delivery (Bogføringsloven, GDPR audit
trail) are statutory requirements.

---

## Trust model

SlothBox makes four guarantees, each enforced at the architecture level — not by
marketing copy:

1. **The server cannot decrypt your files.** All encryption happens in the sender's
   browser using audited libsodium primitives before upload. The decryption key
   travels in the URL fragment (`#key=…`), which is never sent to any server.
   _(v0.1.0-alpha: implemented for symmetric / single-recipient. Per-recipient
   asymmetric encryption via `age` lands in v1.0.)_

2. **Delivery is cryptographically provable without revealing content.** When your
   recipient downloads, we issue an **RFC 3161** signed timestamp receipt
   over the file's hash. You get a court-admissible proof that _something with this
   hash was retrieved at this time_, without revealing what it was. _(Lands in
   v0.5.)_

3. **Burn-after-read is verifiable, not just promised.** When a file is destroyed,
   the destruction event is committed to a public hash chain anyone can audit. You
   get a cryptographic receipt that the encryption key is gone — meaning the
   ciphertext is mathematically unrecoverable, even from our backups. _(Lands in
   v1.0.)_

4. **The architecture is verifiable.** This repository is everything we run.
   `docker compose up -d` brings the entire production stack online on your own
   machine. A standalone offline verifier CLI (`slothbox-verify`) lets you check
   any receipt or deletion proof without contacting our service. _(CLI skeleton
   in v0.1, full verification in v1.0.)_

For the threat model and what we explicitly do **not** protect against, see
[`docs/THREAT_MODEL.md`](docs/THREAT_MODEL.md).

---

## Architecture

13 containers, four languages, one Docker Compose file:

```
                           ┌──────────────┐
                           │     Caddy    │  auto-HTTPS, single public ingress
                           │ reverse proxy│
                           └──┬────┬──┬───┘
                              │    │  │
              ┌───────────────┘    │  └──────────────┐
              │                    │                 │
       ┌──────▼──────┐    ┌────────▼──────┐  ┌───────▼────────┐
       │   Web UI    │    │  API Gateway  │  │ Ingest Service │
       │  Next 15    │◄──►│  Node + Hono  │  │   .NET 8       │
       │  WebCrypto  │ WS │   WebSocket   │  │ Kestrel +      │
       │  drag-drop  │    │   rate-limit  │  │ ImageSharp     │
       └─────────────┘    └────┬──────────┘  └────┬───────────┘
                               │                  │
                          ┌────▼──────────────────▼──────┐
                          │      Postgres 16 (RLS)       │
                          │      MinIO (S3-compat)       │
                          │      Valkey (cache+queue)    │
                          │      NATS (pub/sub)          │
                          └────┬─────────────────────────┘
                               │
       ┌───────────────────────┼─────────────────────────┐
       │                       │                         │
┌──────▼──────┐  ┌─────────────▼────────┐   ┌────────────▼────────┐
│   Reaper    │  │   Receipt Service    │   │   Observability     │
│   Go daemon │  │   .NET 8 + RFC 3161  │   │   Grafana / Prom /  │
│   expiry +  │  │   Merkle audit log   │   │   Loki / Promtail   │
│   gc + chain│  │                      │   │                     │
└─────────────┘  └──────────────────────┘   └─────────────────────┘
```

Detailed service boundaries, data flow, and ADRs in
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

---

## Why each language

Polyglot for honest reasons. If you ask "why X?" in interview the answer holds up:

| Service                    | Language                   | Reason                                                                                                                                                                                                           |
| -------------------------- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Frontend + API gateway** | TypeScript (Next 15, Hono) | Same shared types frontend ↔ backend; React expert stack; fast iteration                                                                                                                                         |
| **Ingest service**         | C# (ASP.NET Core 8)        | Kestrel + `PipeReader` handles 10GB+ chunked uploads with proper backpressure better than Node streams; ImageSharp gives a pure-managed thumbnail pipeline with no native deps; .NET earns its place on the perf-critical I/O path |
| **Receipt service**        | C# (ASP.NET Core 8)        | Strong cryptographic library ecosystem (Bouncy Castle for RFC 3161); shares serialization contracts with ingest                                                                                                  |
| **Reaper daemon**          | Go                         | Single static binary, ~8MB RAM footprint — right tool for cron-style worker. A Node version would be 80MB RAM for the same job                                                                                   |
| **Verifier CLI**           | Go                         | Cross-platform single-binary distribution (brew/scoop/apt) without runtime deps                                                                                                                                  |
| **Database**               | SQL (Postgres 16)          | RLS + triggers + audit chain belong in the database, not in app code — same trust-as-architecture discipline as [SlothCV](https://slothcv.pages.dev)                                                             |

---

## Quick start

```bash
git clone https://github.com/SloThdk/slothbox.git
cd slothbox
cp .env.example .env
docker compose up -d
```

That's it. 13 services come up. Open <http://localhost:8080>.

For development with hot-reload on the frontend:

```bash
pnpm install
pnpm db:migrate
pnpm dev
```

Or on Windows just double-click `start_local_server.bat`.

---

## Stack

- **Frontend** — Next.js 15 · TypeScript · Tailwind v4 · Radix UI · libsodium-wrappers · age
- **API gateway** — Node 20 · Hono · Zod · WebSocket · Drizzle ORM · Lucia auth (v0.5+)
- **Ingest service** — C# / .NET 8 · ASP.NET Core minimal API · Kestrel · ImageSharp · MinIO SDK
- **Receipt service** — C# / .NET 8 · Bouncy Castle · RFC 3161 client · self-hosted Merkle log
- **Reaper daemon** — Go 1.22 · pgx · single static binary · distroless container
- **Verifier CLI** — Go 1.22 · single static binary per platform (brew/scoop/apt)
- **Database** — Postgres 16 (self-hosted) · pg_partman · WAL-G backups
- **Object storage** — MinIO (self-hosted, S3-compatible)
- **Cache + queue** — Valkey (BSD-licensed Redis fork) · BullMQ
- **Pub/sub** — NATS
- **Reverse proxy** — Caddy (auto-HTTPS)
- **Real-time** — WebSocket (control plane) · WebRTC DataChannels (P2P file path, v1.1)
- **Cryptography** — libsodium-wrappers (browser) · libsodium-net (C#) · age (asymmetric)
- **Observability** — Grafana · Prometheus · Loki · Promtail
- **Host** — Hetzner CCX13 (dedicated CPU, 8 GB RAM, EU)
- **CI/CD** — GitHub Actions · GHCR · SSH deploy

---

## Roadmap

| Version          | Status         | Highlights                                                                                                                                                    |
| ---------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **v0.1.0-alpha** | 🟡 in progress | Drag-drop encrypted upload · symmetric key in URL · burn-after-read · expiry · MinIO storage · WebSocket progress · full GitHub repo polish · security gating |
| **v0.5.0**       | 🔜 next        | Lucia auth + dashboard · share history · RFC 3161 receipts · audit chain extension                                                                            |
| **v1.0.0**       | planned        | Per-recipient encryption (`age`) · verifiable deletion proofs · standalone verifier CLI · external cryptographer review                                       |
| **v1.1.0**       | planned        | WebRTC P2P file transfer · MitID OIDC integration · time-locked shares                                                                                        |

Detailed scope per release in [`MILESTONES.md`](MILESTONES.md).

---

## Why EU-hosted

SlothBox runs exclusively in EU regions (currently Hetzner DE / FI). For users
subject to EU data protection (GDPR), Danish Bogføringsloven, or any sector-specific
confidentiality regime (`tavshedspligt`, attorney-client privilege, medical
confidentiality), this matters: data does not transit US-jurisdiction infrastructure
where Schrems II compliance is contested.

This isn't a marketing claim — it's checked into our infrastructure config. See
[`docker-compose.prod.yml`](docker-compose.prod.yml) and the deployment runbook in
[`docs/RUNBOOK.md`](docs/RUNBOOK.md).

---

## Security

- See [`SECURITY.md`](SECURITY.md) for the threat model, disclosure policy, and
  audit history.
- Report vulnerabilities to **security@philipsloth.com** (PGP key fingerprint listed
  in `SECURITY.md`).
- All cryptographic code lives in [`packages/crypto-core/`](packages/crypto-core/) and
  uses **only audited primitives**. PRs that introduce new primitives or alter
  existing ones are auto-closed unless they reference an audited reference
  implementation. See `CONTRIBUTING.md`.

---

## Contributing

This is primarily a personal portfolio project, but issues and PRs are welcome.
See [`CONTRIBUTING.md`](CONTRIBUTING.md) for the rules — particularly the rule about
cryptographic code.

---

## Verifying my claims

Don't trust marketing copy. Read the source:

```bash
# 1. The server cannot read your file — the encryption key is generated in
#    the browser via libsodium's randombytes_buf:
grep -rn "generateKey\|randombytes_buf" packages/crypto-core/src/

# 2. The key never reaches the server — it lives in window.location.hash
#    and travels in the URL fragment, which browsers never send to servers:
grep -rn "window.location.hash\|#key=" apps/web/src/

# 3. The server only stores ciphertext — every blob written to MinIO is the
#    AEAD output, never plaintext:
grep -rn "PutObjectAsync" services/ingest/Services/

# 4. Per-chunk AAD binds (shareId, chunkIndex) so chunks can't be silently
#    reordered or moved between shares:
grep -rn "buildChunkAad" packages/crypto-core/src/

# 5. RLS + audit chain are enforced in the database, not the application:
grep -rn "ROW LEVEL SECURITY\|append_audit_entry" db/migrations/
```

For the v1.0 features (per-recipient encryption, RFC 3161 receipts,
verifiable deletion proofs), the standalone `slothbox-verify` CLI is planned
to let you audit any SlothBox receipt **without contacting our service**. The
v0.1 build ships the CLI as a skeleton that responds to `--help` and reports
"verification lands in v1.0" for the actual subcommands — see
[`tools/verify/README.md`](tools/verify/README.md).

Distribution channels (brew tap / scoop bucket / apt repo) are documented in
the verifier README as v1.0 milestones; they are not active yet. To try the
skeleton today, build from source: `cd tools/verify && go build ./...`.

---

## License

MIT — see [`LICENSE`](LICENSE). Use it, fork it, run your own. The trust
guarantees come from the architecture (open code + verifier CLI + audit), not the
license — so we picked the friendliest one.

---

## Author

Built by **Philip Sloth** in Denmark.
Portfolio: <https://philipsloth.com>
Other open code: [SlothCV](https://github.com/SloThdk/slothcv) (a free CV builder
with similar trust-as-architecture discipline).
