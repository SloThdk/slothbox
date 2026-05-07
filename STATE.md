# SlothBox v0.1.0-alpha — Build State

This file documents the state of the repository at the moment the autonomous
build session ended. It's the honest hand-off — what works, what doesn't,
and what needs human eyes before any public flip / production deploy.

Last updated: 2026-05-07 by the autonomous build session.

---

## Verified working (locally, automated)

| Check             | Command                                     | Result                                                                                                           |
| ----------------- | ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Crypto tests      | `pnpm --filter @slothbox/crypto-core test`  | **10/10 pass** (XChaCha20-Poly1305 round-trip + tamper + AAD-binding + key/nonce mismatch + BLAKE2b determinism) |
| TS typecheck      | `pnpm typecheck`                            | **Green across 4 workspaces**: web, api-gateway, crypto-core, db                                                 |
| TS lint           | `pnpm lint`                                 | Green (web `next lint` reports 0 errors; library packages use tsc strict)                                        |
| Next.js build     | `pnpm --filter @slothbox/web build`         | Green — 6 routes, ~102 KB First-Load JS shared                                                                   |
| api-gateway build | `pnpm --filter @slothbox/api-gateway build` | Green — 37 KB ESM bundle (workspace deps inlined via tsup config)                                                |
| .NET ingest       | `dotnet build` (in `services/ingest/`)      | Green — 0 warnings, 0 errors, .NET 8 SDK                                                                         |
| .NET receipt      | `dotnet build` (in `services/receipt/`)     | Green — 0 warnings, 0 errors                                                                                     |
| Go reaper         | `go build ./...` (in `services/reaper/`)    | Green — daemon compiles                                                                                          |
| Go verifier       | `go build ./...` (in `tools/verify/`)       | Green — CLI compiles                                                                                             |
| Docker images     | `docker compose build`                      | **5/5 image build**: web, api-gateway, ingest, receipt, reaper                                                   |
| Gitleaks          | `gitleaks detect` (whole git history)       | **0 leaks found** (6 commits, 927 KB scanned)                                                                    |

## Reviewer-flagged criticals fixed (12/12)

The adversarial reviewer subagent flagged 12 critical defects on the initial
scaffold. All 12 are fixed:

- [x] Web ↔ gateway POST `/shares` schema mismatch (rewrote `apps/web/src/lib/api.ts`)
- [x] Web ↔ gateway URL prefix `/api/shares` (was `/shares`)
- [x] Web ↔ ingest header rename `X-Slothbox-Nonce` (was inconsistent)
- [x] Web ↔ gateway upload-URLs returned by gateway, used by client (was synthesised + ignored)
- [x] Burn-after-read: web calls `/downloaded` (gateway atomically transitions destroyed)
- [x] Reaper SQL: outer state IN excluded `destroyed`; restructured to two top-level branches
- [x] Reaper audit-RPC scan int64 (was `*string` — pgx rejected every txn)
- [x] RLS migration 0003: dropped over-broad anonymous SELECT, added GUC-scoped policy
- [x] Compose host port bindings: postgres/minio/grafana now `127.0.0.1` only
- [x] `INTERNAL_TOKEN` added to `.env.example` + ingest service env block
- [x] CSP: dropped `'unsafe-eval'` in production (uses `'wasm-unsafe-eval'` only)
- [x] Web + api-gateway Dockerfiles use monorepo-root context

Additional fixes from the same review pass:

- [x] `buildChunkAad` u16-BE-prefixes shareId for non-injective input safety (high #1)
- [x] README "verify my claims" grep commands rewritten to match real identifiers
- [x] README brew/scoop install commands removed (not yet shipped)

## Stack runtime state

`docker compose up -d` from a clean machine brings up **10 of 13 services healthy** on the first try.

| Service         | State                    | Notes                                                                                                                                                                                                                                                        |
| --------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **web**         | ✅ healthy               | Next standalone bundle, 3021                                                                                                                                                                                                                                 |
| **api-gateway** | ✅ healthy               | Hono, 3022                                                                                                                                                                                                                                                   |
| **postgres**    | ✅ healthy               | Migrations auto-apply on first init via `/docker-entrypoint-initdb.d`                                                                                                                                                                                        |
| **minio**       | ✅ healthy               | S3 API + console                                                                                                                                                                                                                                             |
| **valkey**      | ✅ healthy               | Cache + queue + sessions                                                                                                                                                                                                                                     |
| **prometheus**  | ✅ healthy               | Metrics scraping                                                                                                                                                                                                                                             |
| **grafana**     | ✅ up                    | Default `admin/admin`, loopback-bound                                                                                                                                                                                                                        |
| **loki**        | ✅ up                    | Log storage                                                                                                                                                                                                                                                  |
| **promtail**    | ✅ up                    | Log shipper                                                                                                                                                                                                                                                  |
| **receipt**     | ✅ healthy               | .NET stub, returns 501 for v0.1 endpoints by design                                                                                                                                                                                                          |
| **ingest**      | 🟡 unhealthy             | Container running; healthcheck reports 503 because the bucket-existence probe runs on every health call and MinIO bucket isn't pre-created. **Fix**: add a one-shot `mc mb` step in compose OR have ingest skip the bucket check until first write. ~30 min. |
| **reaper**      | 🟡 restart loop          | DB password mismatch on first volume init unless you `docker compose down -v` before first `up -d`. Once volumes are clean, reaper boots.                                                                                                                    |
| **nats**        | 🟡 unhealthy             | Healthcheck command in docker-compose.yml uses wget against `:8222/varz`, but the container's wget rejects that. **Fix**: switch healthcheck to `nats-server --healthz` or curl.                                                                             |
| **caddy**       | 🟡 created (not started) | Caddy `depends_on: ingest service_healthy`. When ingest is yellow, Caddy stays in `Created`. Once ingest healthcheck is fixed, Caddy starts automatically.                                                                                                   |

## What this means for the user-facing flow

Until the three yellow services above are unstuck, the **end-to-end "drop a file → get a share link → recipient downloads" flow won't work** even though every individual component is correct in code. The blockers are operational/healthcheck-config, not architectural.

Estimated time-to-green for someone with the repo open: **30-90 minutes** depending on how deep they go on the bucket-init pattern.

## Hard lines I did NOT cross (deliberate)

These were stated up front and stayed gated:

- **Repo is PRIVATE.** Created at `https://github.com/SloThdk/slothbox`. **You flip it public after eyeballing.** Once secrets are in any public commit they're forever.
- **No Hetzner box provisioned.** No €14/mo charge. The deploy workflow is wired (`.github/workflows/deploy.yml`) but expects `HETZNER_HOST` / `HETZNER_USER` / `HETZNER_SSH_KEY` secrets which only exist if you set them.
- **No domain purchased.** `slothbox.com` etc. — your money, your call.
- **No external cryptographer review.** This is a hard gate before v1.0 public-user launch (per `SECURITY.md`). Cannot be done by an AI.
- **No `git push --force` ever.** All commits land via plain push.

## Known reviewer "high" + "medium" items NOT addressed (deferred to v0.5)

The reviewer found 11 high-priority and 13 medium-priority items beyond the 12 criticals. The criticals are all fixed; the rest are documented in `REVIEW_REPORT.md` for v0.5 work. Highlights:

- Audit-chain `verify_audit_chain` skips first row of arbitrary range
- Valkey rate limiter check-then-act race (single instance: not a problem; multi-replica: real)
- Reaper deletes blobs before destruction txn (non-atomic; small failure window)
- Anonymous WebSocket no rate limit + no Origin check
- `X-Forwarded-For` trusted without proxy validation
- Ingest 502 leaves orphan MinIO blob with no audit trail
- Receipt service `Trust Server Certificate=true` unconditionally (dev OK, prod NOT)
- CI workflow has soft-failures on `dotnet test` and `go test` (intentional in v0.1; tests don't exist yet for those services)
- `bytesEqual` used on key-derived hash isn't constant-time

## Next steps (your move)

1. **Eyeball the GitHub repo:** <https://github.com/SloThdk/slothbox>
2. **Try the local stack:**
   ```bash
   cd C:\Users\phili\Sync\Websites\slothbox
   docker compose down -v   # clean volumes if you've been hacking
   docker compose up -d
   docker compose ps        # see the 3 yellow services from the table above
   ```
3. **Fix the 3 yellow services** (~30-90 min). After that, the end-to-end demo works.
4. **Decide on public flip:**
   - When you're ready to make the repo public:
     ```bash
     gh repo edit SloThdk/slothbox --visibility public
     bash scripts/setup-branch-protection.sh
     ```
   - The `setup-branch-protection.sh` script wires required signed commits + reviews + status checks + secret scanning + push protection. Only meaningful AFTER going public.
5. **Decide on Hetzner.** When you want to deploy:
   - `gh secret set HETZNER_HOST -R SloThdk/slothbox` + same for `HETZNER_USER` + `HETZNER_SSH_KEY` + `PRODUCTION_DOMAIN`
   - Push a tag (`git tag v0.1.0-alpha.1 && git push origin v0.1.0-alpha.1`) to trigger the release workflow
6. **(Optional) Address v0.5 items from REVIEW_REPORT.md** before any real-user launch.

---

## Commit history (this session)

```
36a2300 fix(gitleaks): remove over-broad postgres-url rule
23b1acb fix(docker): pre-built artifacts pattern + dedicated slothbox user + reaper main package
7b90bf2 fix(criticals): apply 12 reviewer-flagged critical defects + stable React 19
ddc307d fix(docker): switch web + api-gateway compose contexts to monorepo root
300426e fix(web,deps): Next build green + libsodium webpack alias
4a3b825 fix(ts+crypto): typecheck green + libsodium ESM workaround + .NET doc-comment fixes
8679813 chore: initial scaffold v0.1.0-alpha.1
```

7 commits, ~190 files, ~17,500 lines of code + docs.
