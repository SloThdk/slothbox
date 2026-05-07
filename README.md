# SlothBox

> **End-to-end encrypted file transfer with court-admissible delivery receipts. The server cannot decrypt anything — and the full source code is open so anyone can audit that claim.**

**Live: <https://slothbox.philipsloth.com>**

[![Live](https://img.shields.io/badge/live-slothbox.philipsloth.com-success)](https://slothbox.philipsloth.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![CI](https://github.com/SloThdk/slothbox/actions/workflows/ci.yml/badge.svg)](https://github.com/SloThdk/slothbox/actions/workflows/ci.yml)
[![Security](https://github.com/SloThdk/slothbox/actions/workflows/security.yml/badge.svg)](https://github.com/SloThdk/slothbox/actions/workflows/security.yml)
[![Deploy](https://github.com/SloThdk/slothbox/actions/workflows/deploy.yml/badge.svg)](https://github.com/SloThdk/slothbox/actions/workflows/deploy.yml)
[![Crypto: libsodium + age](https://img.shields.io/badge/crypto-libsodium%20%2B%20age-brightgreen)](docs/CRYPTO.md)
[![Status: v0.1.0-alpha](https://img.shields.io/badge/status-v0.1.0--alpha-orange)](MILESTONES.md)
[![EU-hosted](https://img.shields.io/badge/region-EU--only-blue)](#why-eu-hosted)

> [!WARNING]
> **v0.1.0-alpha — read this before sending real data.**
>
> Two things are deliberately deferred from v0.1 and matter for any visitor
> evaluating whether to use this build live:
>
> 1. **The shortId is the access secret.** Anyone holding a share URL can
>    destroy or trigger burn-after-read on it — there is no per-share owner
>    token in v0.1. Per-share HMAC tokens land in **v0.5** alongside the
>    Lucia auth + dashboard milestone. Do not paste share URLs into public
>    channels.
> 2. **The integration code is not yet independently audited.** The
>    underlying primitives (libsodium, age) are battle-tested and audited
>    upstream, but the SlothBox glue has only been internally reviewed.
>    External cryptographer review is a hard gate for **v1.0** before any
>    "production-ready" framing.
>
> Use this build for portfolio review and personal experimentation. Do not
> use it for legally-sensitive transfers until v1.0. Full threat model and
> non-goals: [`SECURITY.md`](SECURITY.md).

---

## Production deployment

The reference instance lives at **<https://slothbox.philipsloth.com>**, running on a
single EU-jurisdiction Linux VM (German data centre — actual Schrems II compliance via
infrastructure choice, not a regional label on a US cloud). Every commit to `master`
that passes CI auto-rolls forward via `.github/workflows/deploy.yml`:

| Verification           | Where                                                                                           |
| ---------------------- | ----------------------------------------------------------------------------------------------- |
| TLS (HTTPS / HTTP/3)   | [`https://slothbox.philipsloth.com`](https://slothbox.philipsloth.com)                          |
| Health endpoint        | [`/healthz`](https://slothbox.philipsloth.com/healthz) returns `200 ok`                         |
| Strict CSP w/ nonces   | DevTools → Network → response headers include `nonce-...; strict-dynamic`                       |
| Workflow status        | [Actions](https://github.com/SloThdk/slothbox/actions) — CI / Security / Deploy badges above    |
| Architecture document  | [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — 14-service Docker Compose breakdown            |
| Security threat model  | [`docs/THREAT_MODEL.md`](docs/THREAT_MODEL.md)                                                  |
| Production hardening   | [`docker-compose.prod.yml`](docker-compose.prod.yml) — read-only fs, `cap_drop: ALL`, RLS, etc. |
| Postgres backup policy | `pg-backup` sidecar dumps nightly at 02:30 UTC, gzipped, 28-day retention on a named volume     |
| Observability          | Grafana provisioned at `/grafana` (auth required) with the SlothBox overview dashboard          |
| Alert rules            | [`infra/prometheus/alerts.yml`](infra/prometheus/alerts.yml) — 11 rules, severity-tagged        |

End-to-end smoke test (run from your laptop):

```bash
curl -fsS https://slothbox.philipsloth.com/healthz                # 200 ok
curl -fsS -XPOST -H 'Content-Type: application/json' \
  https://slothbox.philipsloth.com/api/shares                      # 400 (validation)
```

---

## What is SlothBox

Most "send a file" services scan your file or keep a copy. SlothBox can't.

You drop a file onto **slothbox.philipsloth.com**. Your browser locks it with
a key it generates on the spot, before any byte leaves your computer. The
locked blob uploads to the server. You get a link to share. The unlock key
lives in the part of the URL after `#` — which **browsers never send to any
server**, by design (RFC 3986 §3.5). The server therefore stores a locked file
and has no way to know what's inside.

That's the whole product. Everything else (delivery receipts, deletion proofs,
P2P fallback, MitID for verified senders) is built on top.

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

The system makes four guarantees, each enforced at the architecture level —
not by marketing copy:

1. **The server cannot decrypt your files.** All encryption happens in the
   sender's browser using audited libsodium primitives before upload. The
   decryption key travels in the URL fragment (`#key=…`), which is never sent
   to any server.
   _(v0.1.0-alpha: implemented for symmetric / single-recipient. Per-recipient
   asymmetric encryption via `age` lands in v1.0.)_

2. **Delivery is cryptographically provable without revealing content.** When
   the recipient downloads, the system issues an **RFC 3161** signed timestamp
   receipt over the file's hash. The result is a court-admissible proof that
   _something with this hash was retrieved at this time_, without revealing
   what it was. _(Lands in v0.5.)_

3. **Burn-after-read is verifiable, not just promised.** When a file is
   destroyed, the destruction event is committed to a public hash chain anyone
   can audit. The chain entry is a cryptographic receipt that the encryption
   key is gone — meaning the ciphertext is mathematically unrecoverable, even
   from server backups. _(Lands in v1.0.)_

4. **The architecture is verifiable.** This repository is the entire
   production stack. `docker compose up -d` brings it online on any machine.
   A standalone offline verifier CLI (`slothbox-verify`) will let any holder
   of a receipt or deletion proof check it without contacting the live
   service. _(CLI skeleton in v0.1, full verification in v1.0.)_

For the threat model and explicit non-goals, see
[`docs/THREAT_MODEL.md`](docs/THREAT_MODEL.md).

---

## Architecture

14 containers, four languages, one Docker Compose file:

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

The polyglot choice is deliberate. Different services hit different
bottlenecks — each service is matched to the runtime that solves its actual
problem rather than picking one language and forcing it everywhere:

| Service                    | Language                   | Reasoning                                                                                                                                                                                                                                                                                                                                                                                                                         |
| -------------------------- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Frontend + API gateway** | TypeScript (Next 15, Hono) | Zod schemas are shared across the boundary, so a shape change in the API forces a frontend type error at compile time — that bug class is eliminated. Next.js 15 ships a Server Components model that streams HTML over a strict CSP without bolting on a separate template engine.                                                                                                                                               |
| **Ingest service**         | C# (ASP.NET Core 8)        | The perf-critical path — multi-GB chunked uploads with real backpressure. Kestrel + `PipeReader` provides zero-copy reads from socket to disk; Node's stream API buffers eagerly and starves the GC at scale. .NET 8 also has the cleanest minimal-API surface (no controllers, no boilerplate) so the ingest code stays as small as a Hono handler.                                                                              |
| **Receipt service**        | C# (ASP.NET Core 8)        | RFC 3161 timestamp clients need Bouncy Castle. The Java / .NET BC fork is the only mature, audited implementation; rebuilding ASN.1 + CMS in TypeScript would be a multi-month project with no security justification. Sharing Kestrel + DTO conventions with the ingest service keeps the operational surface small.                                                                                                             |
| **Reaper daemon**          | Go 1.24                    | Cron-style workers don't need 80 MB of Node. Go produces a single static binary, ~8 MB RAM footprint, no runtime dependency on the host VM. The reaper sweeps every 60 seconds — at that frequency, the GC + cold-start savings vs Node are real, and Go's `pgx` is the fastest Postgres client benchmarked for this workload.                                                                                                    |
| **Verifier CLI**           | Go 1.24                    | Recipients must be able to audit a receipt offline, on Windows / macOS / Linux, without installing Node or .NET. Go cross-compiles to a single static binary per platform — `brew install slothbox-verify` or `scoop install slothbox-verify` and the tool is ready. No "first install Node 20" friction; no `node_modules` exposing the audit tool's supply chain to whatever happens to be installed locally.                   |
| **Database**               | SQL (Postgres 16)          | Trust guarantees that live in application code can be bypassed by the next bug. Trust guarantees enforced by the database can't. Row-level security, the audit chain's hash linkage, and provider-separation triggers all live in Postgres — same discipline used in [SlothCV](https://slothcv.pages.dev). pg_partman keeps the audit chain partitioned by month so retention sweeps are an `ALTER TABLE DETACH`, not a `DELETE`. |

---

## Quick start

### Try the live deployment

The reference deployment is at **<https://slothbox.philipsloth.com>** (EU-only). Drag-drop a
file, get a share link, send it.

### Or run the entire stack on your machine

```bash
git clone https://github.com/SloThdk/slothbox.git
cd slothbox
cp .env.example .env
docker compose up -d
```

That's it. 14 services come up. Open <http://localhost:8080>.

For development with hot-reload on the frontend:

```bash
pnpm install
pnpm db:migrate
pnpm dev
```

Or on Windows just double-click `start_local_server.bat`.

### Run with the production hardening overlay

The production overlay adds container hardening on top of the base compose:
read-only root filesystems, `cap_drop: ALL` with explicit allowlists,
`no-new-privileges`, per-container memory + CPU limits, json-file log rotation,
loopback-only DB/cache/storage ports, nightly `pg_dump` with 28-day retention.

```bash
# Generate strong secrets first; never use defaults in real prod.
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

See [`docker-compose.prod.yml`](docker-compose.prod.yml) for the full hardening
inventory with comments explaining the threat each control mitigates.

---

## Stack & rationale

This section is written for the lead engineers and architects reviewing the
repo. Every box on the diagram is a specific technology chosen over a real
alternative — the reasoning is here so reviewers don't have to reverse-engineer
it. Nothing on this list is decorative.

### Frontend

#### Next.js 15 · TypeScript · Tailwind v4 · Radix UI

- **Role:** the public marketing surface (`/`, `/about`, `/security`) and the
  upload / decrypt UI. The Server Components renderer streams HTML through a
  strict CSP with per-request nonces; React Client Components handle the
  libsodium WASM calls.
- **Why this stack:** the framework had to ship modern React features
  (Server Components, streaming, built-in middleware) AND let per-request CSP
  nonces bolt onto the runtime emitter without forking the framework. Next
  15's middleware mints a nonce per request and the framework picks it up
  automatically — Vite + a static SPA would force a choice between strict CSP
  and React's hydration model. Tailwind v4 and Radix UI are the lowest-friction
  way to keep the UI consistent without a separate design-system codebase.
- **Alternatives considered:** SvelteKit (smaller bundle, but the React
  ecosystem owns the libsodium-wrappers + age JS bindings the project depends
  on); Remix (fine, but its loader/action model doesn't compose cleanly with
  the CSP-nonce middleware); a hand-rolled Vite SPA + Hono backend (cheaper to
  run but loses Server Components, which the Server-Action upload-initiation
  handshake relies on).

#### libsodium-wrappers (browser) + age (planned for v1.0)

- **Role:** every byte of every file is sealed in the user's browser before
  upload. `libsodium-wrappers` provides XChaCha20-Poly1305 for the symmetric
  AEAD; `age` provides per-recipient asymmetric encryption in v1.0.
- **Why this stack:** libsodium has been independently audited multiple times
  since 2013 — the primitives are NIST-aligned, the API is hard to misuse, and
  the WASM build is small enough to hydrate on first paint. age is the modern
  replacement for PGP for the per-recipient case; Filippo Valsorda is the
  author and the spec is intentionally narrow, which makes review tractable.
- **Alternatives rejected:** Web Crypto only (no XChaCha20 yet, and the raw-key
  handling forces hand-rolled AEAD framing); WebPGP (the spec is its age, the
  implementations are sprawling, and almost no cryptographer recommends it for
  new builds); rolling new primitives (forbidden by the project's
  CONTRIBUTING.md — audited primitives only).

### API + edge

#### Hono on Node 20

- **Role:** the API gateway. Every share is created here, every request is
  rate-limited here, every WebSocket upgrade for upload progress lands here.
- **Why this stack:** Hono is a thin, type-first router with first-class Zod
  adapters and a request pipeline that runs in <1 ms cold. The build needs type
  sharing with the Next.js frontend (same Zod schemas on both sides of the
  network), and Hono's middleware composition keeps the gateway small enough to
  fit one head. Express would work, but its middleware story is older, slower,
  and lacks the type narrowing Hono's `c.req.valid()` provides.
- **Alternatives rejected:** Express (slower, no type-safe req contract);
  Fastify (faster but more ceremony for the same shape); a Next.js API-route
  monolith (couples gateway lifecycle to frontend deploys, which is the wrong
  shape for a security-sensitive service).

#### Caddy 2.8

- **Role:** the single public ingress. Terminates TLS via Let's Encrypt,
  advertises HTTP/3, reverse-proxies the four backend services, caps body sizes
  per route, and strips the `Server` header so the proxy version doesn't leak.
- **Why this stack:** Caddy is the only edge proxy that does ACME-HTTP-01 cert
  issuance + auto-renewal without a single line of config. nginx + certbot is
  the legacy alternative and means hand-writing the renewal cron, the
  renew-hook, and the reload integration. Caddy's directive language is also
  smaller and more self-documenting than nginx's, which matters when an SRE
  unfamiliar with this repo has to debug a 502 at 3 AM.
- **Alternatives rejected:** nginx + certbot (adds a manual cert pipeline);
  Traefik (good, but its config-via-Docker-labels pattern makes the cert + CSP
  - body-cap rules harder to read in one place); HAProxy (rock-solid but
    doesn't terminate TLS with auto-issuance out of the box).

### Ingest path

#### ASP.NET Core 8 + Kestrel + `PipeReader`

- **Role:** receives chunked PUTs of encrypted bytes, streams them straight
  into MinIO with backpressure, and appends a row to the Postgres audit chain
  for every chunk.
- **Why this stack:** this is the only path that has to scale with file size,
  not request count. Kestrel + `PipeReader` reads from the socket without
  intermediate buffering, so a 4 GB upload uses ~16 MB of resident memory
  regardless of network speed. Node streams in v20 still over-buffer
  aggressively for HTTP request bodies — under load that means GC pressure and
  tail latency the upload path can't afford.
- **Alternatives rejected:** Node + `Busboy` (works for ≤500 MB, falls over
  above that on a small VM); Go + `net/http` (would be fast, but means
  hand-rolling multipart parsing and re-implementing Bouncy Castle's ASN.1
  surface for the receipt service that shares this code's conventions).

#### MinIO (S3-compatible)

- **Role:** the encrypted-blob store. Every chunk that reaches ingest is
  written here under a per-share namespace, then re-read on download.
- **Why this stack:** the build needs S3 semantics (object versioning,
  presigned URLs, retry-friendly PUT/GET) without the Schrems II problem. MinIO
  ships the same SDK shape as AWS, runs in a single Docker container, and stays
  in the German data centre with the rest of the stack. The migration path off
  MinIO is also a one-line SDK swap to Cloudflare R2 or a self-hosted Garage
  cluster if egress economics ever shift.
- **Alternatives rejected:** AWS S3 (US jurisdiction — defeats the Schrems II
  story); Cloudflare R2 (great runtime, but adds a vendor without solving any
  current problem); plain filesystem (no presigned URL flow, no versioning,
  harder to scale out later).

### Background work

#### Go 1.24 reaper daemon

- **Role:** sweeps for expired or burn-after-read shares every 60 s, deletes
  their MinIO blobs, transitions the share to `destroyed`, and appends a
  `share_destroyed` entry to the audit chain via a `SECURITY DEFINER` Postgres
  function.
- **Why this stack:** sweep daemons need a small footprint and a predictable
  scheduler. Go produces a single static binary, ~8 MB RAM, distroless
  container, sub-50 ms cold start. A Node version would be ~80 MB RAM and add a
  runtime dependency the production VM otherwise wouldn't need.
- **Alternatives rejected:** a Node cron + worker (heavier, slower startup); a
  Postgres `pg_cron` job (DB-internal cron is hard to test; the sweep logic
  belongs in a real binary that can be run locally with `--once` for
  debugging); a Kubernetes CronJob (overkill for a single-VM deployment).

#### NATS

- **Role:** lightweight pub/sub for cross-service events. Ingest publishes
  "chunk uploaded" / "share completed"; the gateway subscribes to push
  WebSocket progress to the browser; future workers (e.g. the receipt issuer)
  will subscribe here too.
- **Why this stack:** the build needs a message bus, but Kafka is a server farm
  per topic and RabbitMQ is a Java VM the operator shouldn't have to run. NATS
  runs in 12 MB of RAM, ships zero-config, and the Go + Node clients are
  battle-tested at scale (Cloudflare and Mastodon both use it in production).
- **Alternatives rejected:** Redis pub/sub (Valkey already runs the cache
  layer, but coupling pub/sub to the cache makes failure modes worse — the bus
  has to keep working when Valkey is being upgraded); Kafka / Redpanda
  (overkill, much larger ops surface); RabbitMQ (more operational overhead than
  the throughput warrants here).

#### Valkey

- **Role:** the rate-limit + session-cache layer. Every `/api/shares` POST and
  `/chunk/*` PUT runs through a Valkey-backed rate limiter; v0.5 will use it
  for short-lived auth sessions too.
- **Why this stack:** the project needs a Redis-compatible cache it can run in
  production without a creeping licensing problem. Redis Inc. changed its
  licence in mid-2024 to a non-OSI-approved dual model; Valkey is the Linux
  Foundation fork with a permissive BSD-3 licence and a Linux Foundation
  governance model. Drop-in compatibility with the Redis SDKs means zero
  migration cost — same protocol, same client libraries, same cluster mode,
  but with a licence that ships in a public open-source repo without
  commercial-use carveouts.
- **Alternatives rejected:** Redis (licensing risk for any future commercial
  self-hoster); KeyDB (multi-threaded fork, good engineering but the project's
  maintenance velocity dropped after Snap acquired it); DragonflyDB (very fast
  but architecturally different from Redis, more surface area to keep parity
  with).

### Data layer

#### Postgres 16 (self-hosted)

- **Role:** the trust enforcement layer. Every table has row-level security;
  the `audit_chain` table is hash-linked entry-to-entry; provider-separation
  triggers on `auth.identities` (v0.5) prevent silent account-takeover via a
  second OAuth provider.
- **Why this stack:** Postgres is the only database where the security model
  belongs in the schema. RLS + triggers + the `pgcrypto`-backed hash chain mean
  a compromised application server cannot exfiltrate or rewrite data without
  breaking verification — the trust property is enforced one layer below the
  language runtime. Self-hosting (rather than managed Supabase) keeps the ops
  story honest: restore drills, full snapshots, and rebuild-from-compose are
  all in scope without a vendor in the loop.
- **Alternatives rejected:** managed Supabase (great DX, but defeats the
  "operator can run the whole data tier" demo and adds a vendor); MySQL (no
  RLS, no clean trigger story for the audit chain); Mongo / Dynamo (wrong data
  model — the receipt + audit chain is relational and benefits from foreign
  keys + CHECK constraints).

#### Drizzle ORM

- **Role:** the typed query layer for the API gateway. Shares the schema
  definition between the migration runner and the application code without
  duplicate truth.
- **Why this stack:** Drizzle is an SQL-shaped ORM — every query is near-1:1 to
  what gets sent to Postgres, no N+1 surprises, no hidden joins. It's
  edge-runtime compatible (matters because a future v1.1 could push read paths
  to Cloudflare Workers if egress economics shift). Drizzle was also the
  project that triggered a real CVE patch in this repo's CI (drizzle-orm
  SQL-injection on identifier escaping, GHSA-gpj5-g38j-94v9) — confirming the
  maintainer actually responds.
- **Alternatives rejected:** Prisma (too much hidden machinery — the generated
  client is enormous, and schema migrations route through Prisma's binary,
  adding a CI dependency); raw `pg` driver (no type sharing with the migration
  files, and the rewrite cost when a column changes is real); Kysely (good,
  but the type-level query builder ergonomics are worse for the kind of
  `SELECT ... FOR UPDATE` semantics this repo needs).

### Observability

#### Prometheus · Grafana · Loki · Promtail

- **Role:** Prometheus scrapes every service's `/metrics` every 15 s; Grafana
  shows a 9-panel dashboard at `/grafana` (request rate, 5xx, p95/p99 latency,
  container memory, CPU, log feed); Loki + Promtail tail container stdout into
  a structured log store with LogQL queries.
- **Why this stack:** the de-facto OSS observability stack — every operator
  touching this repo already knows it. PromQL alerting is wired in
  (`infra/prometheus/alerts.yml`, 11 rules), Loki's structured-log queries
  match Splunk/Datadog ergonomics without the bill, and Grafana's dashboard
  JSON is checked in so the view is reproducible across deploys.
- **Alternatives rejected:** Datadog / New Relic / Grafana Cloud (they all
  work, but they all leak observability data to a US-jurisdiction vendor —
  same Schrems II problem the rest of the architecture carefully avoids); ELK
  (Elastic licensing went the same way Redis did; Loki is simpler and cheaper).

### CI/CD

#### GitHub Actions (4 workflows)

- **Role:** CI matrix (Node × .NET × Go); Security workflow (Gitleaks, npm
  audit, .NET vulnerable-package scan, govulncheck, CodeQL, Trivy); Deploy
  workflow (multi-arch GHCR build + SSH-deploy to the production VM, gated
  behind `vars.AUTO_DEPLOY` so forks don't trigger production rollouts);
  Dependabot.
- **Why this stack:** GitHub Actions is co-located with the source — every
  other CI provider means shipping the source to a second vendor for the same
  job. The free tier covers everything this repo needs, and the hosted runners
  give Linux / macOS / Windows matrix coverage for the verifier CLI without
  provisioning anything. The Security workflow caught two real CVEs during
  this build (the System.Text.Json stack-overflow and the drizzle-orm
  SQL-injection mentioned above) before the PRs merged.
- **Alternatives rejected:** GitLab CI (would mean mirroring the repo);
  CircleCI / Travis (third-party vendor + cost, no win on capability);
  self-hosted Jenkins (operational overhead disproportionate to a portfolio
  project).

### Hosting

#### Single ARM Linux VM, EU jurisdiction (German data centre)

- **Role:** runs every service in `docker-compose.prod.yml`. One VM, one
  operator, one set of credentials.
- **Why this stack:** for a v0.1 portfolio reference build, VM cost dominates
  only across multiple regions — and the build deliberately doesn't
  multi-region, because the EU-only data path is the product, not a limitation.
  ARM delivers ~30% better price / perf on the compute-bound services (.NET,
  Go) than x86 at the same provider tier, and Docker Buildx makes multi-arch
  images a one-line change in the workflow. The migration path off a single VM
  is straightforward: split state to managed Postgres + S3-compatible storage,
  scale the four services horizontally behind Caddy with sticky sessions on
  the WebSocket route. None of the service code has to change.
- **Alternatives rejected:** AWS / GCP / Azure (US jurisdiction — defeats the
  Schrems II story); Cloudflare Workers (would be cheaper for the static
  surface, but the .NET ingest service can't run on that runtime); Kubernetes
  (overkill for a single-VM deployment; Compose covers this comfortably until
  the cluster needs >1 host).

### Summary table

The full machine-readable list is below. Use this when scanning the repo;
read the prose above when you want to know why each line is there.

- **Frontend** — Next.js 15 · TypeScript · Tailwind v4 · Radix UI · libsodium-wrappers · age (v1.0+)
- **API gateway** — Node 20 · Hono · Zod · WebSocket · Drizzle ORM · Lucia auth (v0.5+)
- **Ingest service** — C# / .NET 8 · ASP.NET Core minimal API · Kestrel · ImageSharp · MinIO SDK
- **Receipt service** — C# / .NET 8 · Bouncy Castle · RFC 3161 client · self-hosted Merkle log
- **Reaper daemon** — Go 1.24 · pgx · single static binary · distroless container
- **Verifier CLI** — Go 1.24 · single static binary per platform (brew/scoop/apt, v1.0+)
- **Database** — Postgres 16 (self-hosted) · pg_partman · WAL-G backups
- **Object storage** — MinIO (self-hosted, S3-compatible)
- **Cache + queue** — Valkey (BSD-licensed Redis fork) · BullMQ
- **Pub/sub** — NATS
- **Reverse proxy** — Caddy 2.8 (auto-HTTPS, HTTP/3, per-route body caps)
- **Real-time** — WebSocket (control plane) · WebRTC DataChannels (P2P file path, v1.1)
- **Cryptography** — libsodium-wrappers (browser) · libsodium-net (C#) · age (asymmetric, v1.0+)
- **Observability** — Grafana · Prometheus · Loki · Promtail
- **Host** — single EU-jurisdiction ARM Linux VM with managed firewall (German data centre)
- **CI/CD** — GitHub Actions (CI/Security/Deploy/Dependabot) · GHCR multi-arch (amd64+arm64) · SSH deploy with `vars.AUTO_DEPLOY` gate
- **TLS** — Caddy 2.8 with Let's Encrypt · HTTP/3 · automatic renewal · per-request CSP nonce middleware

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

SlothBox runs exclusively in EU regions — the reference deployment is hosted on
an EU-jurisdiction VM in a German data centre. For users subject to EU data
protection (GDPR), Danish Bogføringsloven, or any sector-specific confidentiality
regime (`tavshedspligt`, attorney-client privilege, medical confidentiality),
this matters: data does not transit US-jurisdiction infrastructure where
Schrems II compliance is contested.

This isn't a marketing claim — it's checked into the infrastructure config. See
[`docker-compose.prod.yml`](docker-compose.prod.yml) and the deployment runbook
in [`docs/RUNBOOK.md`](docs/RUNBOOK.md).

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

## Verifying the claims

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

For the v1.0 features (per-recipient encryption, RFC 3161 receipts, verifiable
deletion proofs), the standalone `slothbox-verify` CLI will let any holder of
a receipt audit it **without contacting the live service**. The v0.1 build
ships the CLI as a skeleton that responds to `--help` and reports "verification
lands in v1.0" for the actual subcommands — see
[`tools/verify/README.md`](tools/verify/README.md).

Distribution channels (brew tap / scoop bucket / apt repo) are documented in
the verifier README as v1.0 milestones; they are not active yet. To try the
skeleton today, build from source: `cd tools/verify && go build ./...`.

---

## License

MIT — see [`LICENSE`](LICENSE). Use it, fork it, run your own. The trust
guarantees come from the architecture (open code + verifier CLI + audit), not
from the license — so the friendliest available licence wins.

---

## Author

Built by **Philip Sloth** in Denmark.
Portfolio: <https://philipsloth.com>
Other open code: [SlothCV](https://github.com/SloThdk/slothcv) (a free CV builder
with similar trust-as-architecture discipline).
