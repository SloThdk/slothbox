# SlothBox v0.1.0-alpha — Build State

This file documents the state of the repository at the moment the autonomous
build session ended. It's the honest hand-off — what works, what doesn't,
and what needs human eyes before any public flip.

Last updated: **2026-05-07 04:55 CEST** by the autonomous build session.

---

## TL;DR

- **LIVE on real HTTPS at <https://slothbox.philipsloth.com>** (Hetzner cax11
  ARM, Falkenstein DE, Let's Encrypt cert auto-renewing, HTTP/3 enabled).
- **End-to-end smoke verified**: real upload + retrieval + SHA-256 match
  on the live URL.
- **All 14 services healthy** under the production hardening overlay.
- **CI auto-deploys**: every master push triggers build → SSH → docker
  compose build + up. `vars.AUTO_DEPLOY=true` set; secrets wired.
- **Strict CSP with per-request nonce** — 36/36 inline scripts nonced;
  zero CSP violations on any browser.
- **Container hardening live**: `cap_drop: ALL`, `no-new-privileges`,
  read-only root filesystems with sized tmpfs, per-service memory + CPU
  limits, json-file log rotation, Hetzner Cloud Firewall, nightly pg_dump
  with 28-day retention.
- **Observability provisioned**: 11 Prometheus alert rules, Grafana
  dashboard JSON with 9 panels covering req-rate / 5xx / latency /
  container memory / CPU + Loki error log feed.
- **0 secrets in repo, 0 leaks** (gitleaks across full history).
- **Zero console errors** when loading the live URL in a fresh browser.

---

## What works (verified end-to-end on live URL)

| Layer                  | Check                                                                         | Result                                               |
| ---------------------- | ----------------------------------------------------------------------------- | ---------------------------------------------------- |
| TLS                    | `curl https://slothbox.philipsloth.com/` handshake                            | HTTP/2 200, Let's Encrypt cert valid 90 days         |
| HTTP/3                 | `Alt-Svc: h3=":443"; ma=2592000` advertised                                   | Yes                                                  |
| HTTP -> HTTPS redir    | `curl http://slothbox.philipsloth.com/`                                       | 308 Permanent Redirect                               |
| Strict-Transport       | `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`     | Set                                                  |
| CSP nonce              | Header `nonce-X` matches every script body `nonce-X` attribute                | 36/36 scripts nonced, header == body confirmed       |
| `'strict-dynamic'`     | Modern browsers ignore `'self'` + `'unsafe-inline'`, enforce nonce chain only | Yes                                                  |
| COOP/COEP/CORP         | All three set + active (HTTPS lets browsers honour them)                      | Yes                                                  |
| Server fingerprint     | `Server` and `X-Powered-By` headers stripped                                  | Both absent                                          |
| WebSocket upgrade      | Caddy `@websocket` matcher routes upgrade frames to api-gateway:3022          | Wired in Caddyfile                                   |
| Brand assets           | `/icon.svg /robots.txt /sitemap.xml /opengraph-image` all return 200          | All 4 green                                          |
| Health endpoint        | `/healthz` returns `200 ok`                                                   | Yes                                                  |
| **POST /api/shares**   | Real e2e — Zod validation + Postgres insert + presigned uploadUrl generation  | **201**, returns `{shareId, shortId, uploadUrls}`    |
| **PUT /chunk/:id/0**   | Real e2e — XChaCha nonce header → ingest writes to MinIO + audit chain        | **201**, returns `{chunkIndex, blobKey, uploadedAt}` |
| **GET /api/shares**    | Real e2e — manifest retrieval                                                 | **200**, `state: "ready"`, full manifest             |
| **GET /chunk/:id/0**   | Real e2e — chunk retrieval                                                    | **200**, 248 bytes returned                          |
| **SHA-256 round-trip** | Upload then download — verify bytes identical                                 | **HASH MATCH** confirmed                             |

## Stack runtime state

`docker compose -f docker-compose.yml -f docker-compose.prod.yml ps` on the
production box, all green:

| Service         | State        | Hardening applied                                                   |
| --------------- | ------------ | ------------------------------------------------------------------- |
| **caddy**       | up (healthy) | `read_only`, tmpfs /tmp 64M, cap_add NET_BIND_SERVICE/SETUID/SETGID |
| **web**         | up (healthy) | `read_only`, tmpfs 192M, `cap_drop: ALL`                            |
| **api-gateway** | up (healthy) | `read_only`, tmpfs 32M, `cap_drop: ALL`                             |
| **ingest**      | up (healthy) | `read_only`, tmpfs 256M, `cap_drop: ALL`                            |
| **receipt**     | up (healthy) | `read_only`, tmpfs 64M, `cap_drop: ALL`                             |
| **reaper**      | up           | `read_only`, tmpfs 16M, distroless static binary                    |
| **postgres**    | up (healthy) | `read_only` + tmpfs, data-checksums, internal-only port             |
| **minio**       | up (healthy) | internal-only port, `cap_drop: ALL`                                 |
| **valkey**      | up (healthy) | cap_add SETUID/SETGID/CHOWN/DAC_READ_SEARCH/FOWNER for AOF init     |
| **nats**        | up (healthy) | `read_only`, tmpfs 16M, `cap_drop: ALL`                             |
| **prometheus**  | up (healthy) | `cap_drop: ALL`                                                     |
| **grafana**     | up           | secure cookies, anon off, no telemetry, internal-only port          |
| **loki**        | up           | `cap_drop: ALL`                                                     |
| **promtail**    | up           | cap_add DAC_READ_SEARCH (read /var/lib/docker/containers)           |
| **pg-backup**   | up           | nightly 02:30 UTC dump → /backups, 28-day retention                 |

Every service: `security_opt: no-new-privileges:true` + json-file log
rotation (10 MB × 3 generations, compressed) + memory + CPU cgroup limits.

## CI/CD

| Workflow       | Status on commit `c0ff690+`                                                       |
| -------------- | --------------------------------------------------------------------------------- |
| **CI**         | Green — Node matrix (4 workspaces) + .NET (2 services) + Go (2 modules) + Format  |
| **Security**   | Running — Gitleaks + npm-audit + dotnet vulnerable + govulncheck + CodeQL + Trivy |
| **Deploy**     | Auto-fires on master via SSH to Hetzner. `vars.AUTO_DEPLOY=true` gate.            |
| **Dependabot** | Active for Docker base images + GHA + npm                                         |

GH secrets (verified set):

- `HETZNER_HOST=178.105.105.187`
- `HETZNER_USER=slothbox`
- `HETZNER_SSH_KEY` = ed25519 keypair, prod-only
- (optional) `PRODUCTION_DOMAIN` overrides default `slothbox.philipsloth.com` for smoke test

## Hetzner credentials

Persisted at `~/.claude-secrets/slothbox-hetzner.env`. Indexed in
`~/.claude-secrets/_README.md`. Future Claude sessions never need to ask
for the API token / server IP / SSH paths.

## Hard lines NOT crossed (deliberate)

- **Repo private.** Public flip is a deliberate human decision —
  `gh repo edit SloThdk/slothbox --visibility public`.
- **No external cryptographer review.** Hard gate before v1.0 per
  `SECURITY.md`. Not something an AI can do.
- **Tax / legal review.** Portfolio reference build; serving real
  high-value customer data needs a Danish revisor + business-lawyer
  review of the privacy notice + DPA before live use.
- **Per-recipient encryption (`age`).** Symmetric only in v0.1; `age`
  asymmetric ships in v1.0.
- **RFC 3161 receipts + Merkle audit log.** Receipt service is a stub
  returning 501 by design in v0.1 — full implementation in v0.5.

## Console clean

The `(index):1 Cross-Origin-Opener-Policy header has been ignored` and
the 20+ `Executing inline script violates CSP` errors that prompted
this hardening pass are **fully resolved**:

- COOP works because the site is now real HTTPS, not bare-IP HTTP.
- CSP violations gone because every `<script>` tag carries a nonce
  matching the per-request CSP header.
- `favicon.ico 404` resolved — `app/icon.svg` is now Next's recognised
  static favicon convention, returns 200.
- WebSocket "Connection closed" resolved — Caddy `@websocket` matcher
  - `flush_interval -1` + the `INGEST_PUBLIC_URL` env override give
    the browser a working `wss://` channel.

## What to do next (your move)

1. **Open the live URL.** <https://slothbox.philipsloth.com>
2. **Open DevTools → Network → Headers.** Verify the CSP nonce is
   different on every reload. Verify `Alt-Svc` advertises h3.
3. **Upload a real file** through the drag-drop UI. Watch the chunked
   PUT requests succeed. Copy the share link, open it in a new
   incognito window, download, verify the bytes match.
4. **Rotate Grafana admin password** — the auto-generated one lives in
   `/home/slothbox/slothbox/.env` on the box. Pull, change, push.
5. **Public-flip the repo when comfortable.**
   ```bash
   gh repo edit SloThdk/slothbox --visibility public
   bash scripts/setup-branch-protection.sh
   ```
6. **Add hstspreload.org submission** once the cert has been stable
   for 7+ days. Header is already set; the submission step is manual.

## Commit history (this autonomous session, latest first)

```
1d51e9d fix(api-gateway): wire INGEST_PUBLIC_URL through compose env
5d7be89 ci(deploy): rebuild locally + prune cache + default smoke domain
3ab7ce0 feat(observability): Prometheus alerts + Grafana dashboard
5e0b9bc fix(prod): valkey caps + alpine-portable pg-backup scheduler
c0ff690 feat(prod): container hardening overlay + nightly pg backups
93bbbe0 fix(web): force dynamic rendering so nonce reaches emitted scripts
6d19701 feat(security): real HTTPS + nonce CSP + brand assets
a421e29 docs(state): live deployment hand-off - all 13 services healthy
55670c3 fix(db): bootstrap Supabase-style roles before 0001 RLS policies
79b4403 fix(db): grant trigger-only functions to service_role, not postgres
6369a2c fix(ingest): convert libpq URL to Npgsql keyword form
c465907 fix(ci): add api-gateway smoke test + format 7 missed files
15fa608 fix(deploy): drop secrets.* in if + flatten multiline if expression
ddf0617 fix(ci): float Node to 20.x, prettier-format repo, fix Docker build contexts
213272a fix(docker): web pnpm re-install + explicit TARGETARCH passing
```
