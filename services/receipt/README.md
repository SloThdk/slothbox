# SlothBox.Receipt

RFC 3161 timestamped delivery receipt service.

**Status:** v0.1.0-alpha.1 — **SKELETON**. The service compiles, runs, exposes
`/healthz` + `/metrics`, and stubs the receipt endpoints with `501 Not Implemented`.
The full RFC 3161 issuing + Merkle audit chain lands in **v0.5.0**. See the root
[`MILESTONES.md`](../../MILESTONES.md) and the architecture brief in
[`../../docs/RECEIPTS.md`](../../docs/RECEIPTS.md).

## What ships in v0.1

| Endpoint                | Method | v0.1 behaviour                                                                                                             |
| ----------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------- |
| `/healthz`              | GET    | 200 with `{ "status": "ok", "service": "receipt", "version": "0.1.0-alpha.1" }` when healthy. 503 if Postgres probe fails. |
| `/metrics`              | GET    | Prometheus scrape (process + ASP.NET Core HTTP histograms).                                                                |
| `/receipt/{shortId}`    | GET    | **501** with `{ error: "not_implemented", milestone: "v0.5.0", message: "..." }`.                                          |
| `/receipt/issue`        | POST   | **501** — same envelope. Internal endpoint that the api-gateway will call when a download completes.                       |
| `/audit/anchors/{date}` | GET    | **501** — same envelope. Public Merkle root anchor for a UTC date.                                                         |

`/receipt/*` and `/audit/anchors/*` return the same `{error,message,milestone}`
shape so consumers can branch on `error == "not_implemented"` without parsing
different schemas. The flip-day diff in v0.5 is purely structural.

## What lands in v0.5

From [`docs/RECEIPTS.md`](../../docs/RECEIPTS.md):

1. **RFC 3161 timestamp authority round-trip** — POSTs the encrypted blob's
   BLAKE2b-256 hash to a TSA (FreeTSA.org for v0.5, paid TSA before v1.0),
   gets back a signed `TimeStampToken`. `BouncyCastle.Cryptography` is the
   only mature .NET library for this; it's already declared as a dependency
   in `SlothBox.Receipt.csproj`.
2. **Merkle audit chain** — every receipt becomes a leaf in an append-only
   BLAKE2b Merkle tree. Roots are published every N leaves or every M minutes
   to a public read-only endpoint at `/audit/anchors/{date}`.
3. **Postgres persistence** — `merkle_leaves` and `merkle_anchors` tables
   added in a new migration (`db/migrations/0003_receipt_audit.sql`). The
   leaf table is enforced append-only via a `BEFORE UPDATE/DELETE` trigger.
4. **Verifier CLI alignment** — receipt JSON shape matches
   [`docs/RECEIPTS.md` § Receipt format](../../docs/RECEIPTS.md#receipt-format)
   exactly; the standalone Go verifier consumes the same bytes.

## Architecture brief (one-paragraph version)

The receipt service answers a single question: was a specific encrypted file
retrieved at a specific time? It does so without revealing the content.
SlothBox produces the proof by hashing the file (the encrypted blob — we never see plaintext),
asking an RFC 3161 timestamp authority to sign over the hash with the current
time, and recording the signed token as a leaf in a public Merkle tree. The
tree's root is published periodically. An auditor verifies a receipt by
checking the TSA signature offline and re-deriving the Merkle root from the
proof — if either fails, the receipt is invalid; if both succeed, the receipt
is tamper-evident because retroactively forging it would require the published
root to also change. Full version in [`docs/RECEIPTS.md`](../../docs/RECEIPTS.md).

## Running locally

This service is one of many in the project's `docker-compose.yml`. Start the
full stack from the repo root:

```bash
docker compose up -d receipt
curl http://localhost:3024/healthz
# {"status":"ok","service":"receipt","version":"0.1.0-alpha.1",...}
```

Standalone (without Docker):

```bash
cd services/receipt
RECEIPT_PORT=3024 \
RECEIPT_TSA_URL=https://freetsa.org/tsr \
DATABASE_URL=postgresql://slothbox:dev@localhost:5433/slothbox \
LOG_LEVEL=Information \
dotnet run
```

## Configuration

All settings come from environment variables. They're bound to a
[`ReceiptOptions`](Configuration/ReceiptOptions.cs) record at startup and
validated via `DataAnnotations` — invalid env fails fast.

| Variable                      | Default                   | Purpose                                               |
| ----------------------------- | ------------------------- | ----------------------------------------------------- |
| `RECEIPT_PORT`                | `3024`                    | Kestrel listen port.                                  |
| `RECEIPT_TSA_URL`             | `https://freetsa.org/tsr` | RFC 3161 TSA endpoint (used in v0.5).                 |
| `RECEIPT_TSA_TIMEOUT_SECONDS` | `30`                      | TSA HTTP timeout (used in v0.5).                      |
| `DATABASE_URL`                | _(required)_              | libpq URI. v0.1 only uses it for `/healthz`.          |
| `LOG_LEVEL`                   | `Information`             | Serilog minimum level. Tolerates `info`, `warn`, etc. |

## File layout

```
services/receipt/
├── SlothBox.Receipt.csproj        # .NET 8, deps pinned, warnings-as-errors
├── Program.cs                     # Host bootstrap, options binding, endpoint mapping
├── Dockerfile                     # Multi-stage Alpine build, non-root, healthcheck
├── .dockerignore
├── README.md                      # this file
├── Configuration/
│   └── ReceiptOptions.cs          # IOptions<ReceiptOptions> bound from env
├── Endpoints/
│   ├── HealthEndpoint.cs          # /healthz
│   ├── ReceiptEndpoint.cs         # /receipt/* (501 stubs)
│   └── AnchorsEndpoint.cs         # /audit/anchors/* (501 stub)
└── Services/
    ├── IReceiptIssuer.cs          # Contract for v0.5 issuer
    ├── StubReceiptIssuer.cs       # v0.1 NotImplementedException stub
    ├── IMerkleLog.cs              # Contract for v0.5 audit chain
    └── StubMerkleLog.cs           # v0.1 NotImplementedException stub
```

## Why the stubs throw

`StubReceiptIssuer` and `StubMerkleLog` are wired into DI so the dependency
graph in v0.1 is byte-identical to v0.5 — the v0.5 PR is a single-line
registration swap. The HTTP layer short-circuits to `501` before reaching the
stubs, but if anything ever gets past it (a future test that hits the
service directly, say), `NotImplementedException` with a milestone reference
fails loud rather than silent.

## Security notes (v0.1)

- `Server` header suppressed (`AddServerHeader = false`).
- Container runs as non-root `app:app`.
- All settings validated at startup — no NRE-on-first-request paths.
- v0.5 will add: TSA-only egress allow-list, mTLS between api-gateway and
  this service, rate limiting on `/receipt/issue`, structured audit log to
  Loki for every issuance.

## Related

- [`MILESTONES.md`](../../MILESTONES.md) — v0.1 → v1.1 phased plan.
- [`docs/RECEIPTS.md`](../../docs/RECEIPTS.md) — full receipt architecture.
- [`docs/ARCHITECTURE.md`](../../docs/ARCHITECTURE.md) — system overview.
- [`docs/THREAT_MODEL.md`](../../docs/THREAT_MODEL.md) — what receipts defend against.
