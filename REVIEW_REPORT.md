# SlothBox v0.1.0-alpha Review Report

## Verdict
**HOLD — substantial structural defects make the upload/download flow non-functional end-to-end and the reaper unable to actually destroy burn-after-read shares; ~12 critical fixes required before any public push, even as a portfolio reference.**

The crypto primitives in `packages/crypto-core/` are clean. Almost everything wrapped around them is broken or wired up incorrectly — the system as shipped will not move bytes from sender to recipient, and burn-after-read leaks blobs forever. Headlines below in priority order; line refs are absolute paths to the files in the worktree.

---

## Critical (must fix before public push)

- [ ] **Web ↔ gateway request body schema is fully incompatible.** `apps/web/src/lib/api.ts:41-50` posts `{ fileName, fileSize, mimeType, chunkCount, chunkSize, expiryHours, burnAfterRead, keyHash }`; `apps/api-gateway/src/routes/shares.ts:154-194` requires `{ fileSize, fileHash, encryptedMeta, nonceMeta, chunkCount, chunkSize, expiresAt (ISO date), burnAfterRead, maxDownloads }`. Every field except `chunkCount`, `chunkSize`, `burnAfterRead`, `fileSize` is differently named or missing. **Every share-create call returns HTTP 400.**

- [ ] **Web ↔ gateway URL prefix mismatch.** Gateway mounts shares router at `/api` (`apps/api-gateway/src/app.ts:139`), so the live route is `/api/shares`. Web client posts to `${API_URL}/shares` (`apps/web/src/lib/api.ts:174`) with `API_URL=http://localhost:3022`, hitting `/shares` directly. **404 on every share request.** Either the gateway needs to also expose `/shares` (matching `/healthz` style) or the env contract needs `NEXT_PUBLIC_API_URL` to include `/api`, or the client must add the prefix.

- [ ] **Web client never sends a real upload token; ingest never validates one.** `apps/web/src/lib/upload.ts:232` PUTs with `X-Slothbox-Upload-Token: <uploadToken>`. Gateway returns no `uploadToken` field anymore (response is `{ shareId, shortId, uploadUrls }` per `apps/api-gateway/src/routes/shares.ts:327-334`). Ingest's `UploadEndpoint.HandleAsync` (`services/ingest/Endpoints/UploadEndpoint.cs:78-289`) **never reads any auth header on PUT**. Result: anyone who guesses or scrapes a `shortId` can overwrite, append, or fill any pending share with arbitrary ciphertext, breaking integrity guarantees the README explicitly promises. The `shortId` ~60 bits is fine for "the link is the secret" but the contract assumed an ingest-side HMAC token check that simply doesn't exist.

- [ ] **Web ↔ ingest header name mismatch.** Web sends `X-Slothbox-Nonce` (`apps/web/src/lib/upload.ts:231`); ingest expects `X-Chunk-Nonce` (`services/ingest/Endpoints/UploadEndpoint.cs:170`). Same error in reverse on the GET path: web reads `X-Slothbox-Nonce` (`apps/web/src/lib/download.ts:258`); ingest sets `X-Chunk-Nonce` (`services/ingest/Endpoints/DownloadEndpoint.cs:118`). Result: every chunk PUT 400s with `missing_nonce_header`, every chunk GET fails the nonce header check on the receiver.

- [ ] **Web ↔ ingest URL path mismatch.** Web hits `/chunk/:shortId/:chunkIndex` (`apps/web/src/lib/upload.ts:216`, `apps/web/src/lib/download.ts:239`); ingest mounts the same path (good) but the gateway's `buildUploadUrl` returns `/upload/:shareId/:chunkIndex` with the UUID, not the shortId (`apps/api-gateway/src/routes/shares.ts:147-150`). The web client ignores `uploadUrls` from the gateway response entirely (`apps/web/src/lib/upload.ts:175-182`) and synthesises its own URL — so the gateway-returned URLs are dead, but the client-built URL pattern needs to match ingest, not the gateway output. The `/upload` vs `/chunk` discrepancy makes the `uploadUrls[]` field worse than useless: any future client that trusts it will 404.

- [ ] **Reaper never picks up burn-after-read shares already flipped to `destroyed` by the gateway.** `services/reaper/internal/reaper/db.go:115-126`:
  ```sql
  WHERE state IN ('ready', 'uploading', 'pending')
    AND ( ... OR (burn_after_read = true AND state = 'destroyed' ...) ... )
  ```
  The outer `state IN (...)` already filters out `'destroyed'`, so the second OR clause **can never match**. Burn-after-read shares whose state was atomically transitioned by `increment_download` (`db/migrations/0001_init.sql:160-195`) and the gateway's `/downloaded` route (`apps/api-gateway/src/routes/shares.ts:476-571`) leak their MinIO blobs forever. This defeats the central "deletion is verifiable" promise of the README.

- [ ] **Reaper's audit-RPC scan-type mismatch will throw at runtime.** `db/migrations/0002_audit_chain_helpers.sql:11` declares `RETURNS BIGINT`. `services/reaper/internal/reaper/db.go:309-310` does `tx.QueryRow(...).Scan(&auditID string)`. pgx will fail conversion of an `int8` column to a `*string` target. Every reaper destruction txn will roll back at the audit-append step, so even if the bug above were fixed, no share would ever be successfully reaped.

- [ ] **`triggerBurn` route doesn't exist on the gateway.** Web's `apps/web/src/lib/api.ts:200-206` POSTs `/shares/:shortId/burn`; gateway has only `/shares/:shortId/destroy` and `/shares/:shortId/downloaded` (`apps/api-gateway/src/routes/shares.ts:411-571`). After a successful download the burn-after-read receiver page silently fails to flip the share — the comment in `apps/web/src/components/Decrypt.tsx:67-72` even pre-emptively swallows the error, so this will be invisible in production until someone notices that burn-after-read shares stay readable until the (broken) reaper sweep that never sweeps them.

- [ ] **`shares_select_anonymous_by_id` RLS policy provides no per-row isolation.** `db/migrations/0001_init.sql:117-119`:
  ```sql
  CREATE POLICY shares_select_anonymous_by_id ON shares
      FOR SELECT
      USING (state = 'ready' OR state = 'uploading' OR state = 'pending');
  ```
  The policy name claims "by id" but there is no `short_id` predicate. Any role for which RLS applies (i.e. anything *not* the service role / superuser) can `SELECT * FROM shares` and read every other tenant's `encrypted_meta`, `nonce_meta`, `file_hash`, expiry, etc. The application enforces secrecy through the `WHERE short_id = $1` clause in handler code; the database layer enforces nothing. For "trust comes from architecture" (README:113-114), this is the wrong shape.

- [ ] **Postgres + MinIO + Grafana ports bound to host in dev compose.** `docker-compose.yml:188 (5433:5432)`, `:210-211 (9000:9000, 9001:9001)`, `:286-287 (3030:3000)` — the stated invariant ("only Caddy is bound to host ports for public ingress", `docker-compose.yml:8`) is broken. MinIO console with default `MINIO_ROOT_*` creds (`MINIO_ACCESS_KEY=slothbox-local`, `MINIO_SECRET_KEY=CHANGE_ME_LOCAL_DEV_ONLY_MIN_8_CHARS`) is a one-curl pivot to all ciphertext. Grafana ships `admin/admin` (`docker-compose.yml:280`). On any dev machine reachable from a co-worker / café network this is a live exposure. Prod compose `ports: []` overrides exist — but the dev compose is what every reader's first `docker compose up -d` runs.

- [ ] **`INTERNAL_TOKEN` is required for ingest startup but is nowhere in compose, prod compose, or `.env.example`.** `services/ingest/Configuration/IngestOptions.cs:53-55`:
  ```csharp
  [Required(AllowEmptyStrings = false)]
  [MinLength(32, ErrorMessage = "INTERNAL_TOKEN must be at least 32 characters")]
  public string InternalToken { get; set; } = "";
  ```
  Neither `docker-compose.yml:94-124` nor `.env.example` provides this. **The ingest service refuses to start.** Quick-start (`docker compose up -d` per README:149) fails immediately.

- [ ] **API gateway / web Docker builds will fail in CI and prod.** `apps/api-gateway/Dockerfile:29-32` and `apps/web/Dockerfile:26-28` copy from monorepo paths (`COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./`, `COPY apps/web/package.json ./apps/web/`), expecting context = repo root. But `docker-compose.yml:42-43` and `.github/workflows/deploy.yml:31-38` use `context: ./apps/web` and `context: ./apps/api-gateway`. From those subdir contexts, the `COPY` lines that reach for the workspace lockfile have nothing to copy. Build error: `failed to compute cache key: failed to walk /var/lib/docker/.../pnpm-lock.yaml: lstat ...: no such file or directory`. The Dockerfile comment (`apps/web/Dockerfile:5-9`) says context is the monorepo root — but no caller sets it that way.

---

## High (must fix before v0.5)

- [ ] **`buildChunkAad` is non-injective** — `concatBytes(stringToBytes(shareId), uint32ToBytesBE(chunkIndex))` (`packages/crypto-core/src/symmetric.ts:45-47`) produces ambiguous boundaries because `shareId` length is not fixed-prefixed. With the current 12-char alphanumeric shortId enforcement (`apps/api-gateway/src/routes/shares.ts:54-56`) it's safe in practice, but if shortId length ever varies (e.g. v0.5 owned-share UUIDs vs anonymous shortIds), AAD for `("abc12", chunk 0x73310030)` collides with `("abc12s10", chunk 0)`. Add a length prefix or domain separator. Cheap fix; expensive bug to find later.

- [ ] **Audit-chain `verify_audit_chain` skips the first row in the requested range.** `db/migrations/0002_audit_chain_helpers.sql:69-72`:
  ```sql
  IF v_prev IS NULL THEN
      v_prev := r.entry_hash;
      CONTINUE;
  END IF;
  ```
  The first row (when `p_from > 1`) is never validated against its `prev_hash` or its recomputed `entry_hash`. If an attacker tampered with seq=p_from specifically, `verify_audit_chain(p_from, ...)` will return NULL (clean) for any range starting at the tampered row. Fix: load `audit_chain.entry_hash` of `p_from - 1` as the seed for `v_prev`, or reject `p_from > 1` until you do.

- [ ] **Valkey rate limiter has a check-then-act race.** `services/ingest/Services/ValkeyRateLimiter.cs:65-77` does a non-transactional sequence: ZREMRANGEBYSCORE → ZCARD → conditional ZADD. The class header comment claims "MULTI/EXEC so concurrent callers can't slip through a window race" (lines 11-12), but the implementation uses neither `IDatabase.CreateTransaction()` nor a Lua script. Two concurrent requests at limit-1 both ZCARD, both succeed. The api-gateway version (`apps/api-gateway/src/middleware/rateLimit.ts:80-98`) uses a `pipeline` (atomic on a single connection but not transactional) and ZADDs unconditionally before checking, so it's actually correct — but documents the wrong algorithm. Pick one and apply consistently; either is fine, mismatched docs aren't.

- [ ] **Reaper deletes MinIO blobs *before* the destruction txn — non-atomic.** `services/reaper/internal/reaper/reaper.go:186-225`: `removeBlobs` runs (network I/O, no DB lock held) then `finalizeDestroy`. If the daemon dies between steps, blobs are gone but `state='ready'`/`expires_at < now()` row stays — next sweep finds it again, re-issues `DELETE` to MinIO (idempotent NoSuchKey OK), opens txn, *but the audit chain entry now has `chunkCount = len(chunkKeys)` from the second fetch which may be 0*. The audit trail records "destroyed 0 chunks" for a share that genuinely had N. Better: write a `pending_destroyed` state row first inside a txn, then delete blobs, then mark `destroyed` in a second txn. Also lets you avoid double-emitting `share_destroyed` audit events.

- [ ] **Anonymous WebSocket has no rate limit and no Origin check.** `apps/api-gateway/src/ws/progress.ts:59-77` accepts any client with a syntactically valid `?shareId=…`, no per-IP cap, no `Origin` validation, and never verifies the shareId actually exists. An attacker can open thousands of WS connections (each costs a 30s `setInterval` heartbeat closure forever in process memory) and exhaust the gateway. Mount the same `rateLimit` middleware on the upgrade route (the WS-adapter setup makes that awkward but doable via a counter on `clientIp` keyed in Valkey before `upgradeWebSocket`).

- [ ] **`sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(plaintext, aad, null, nonce, key)` passes `null` as `nsec`** — that is the documented libsodium-wrappers contract, but the call is buried in `packages/crypto-core/src/symmetric.ts:68-74` with no comment explaining the slot. Add a comment or replace with the named-arg form so a future reader doesn't move the AAD into the nsec slot by accident. (Also the type sig in `@types/libsodium-wrappers` makes argument-order swaps silent — TS doesn't catch positional arg confusion here.)

- [ ] **Audit chain insert path has no INSERT-policy on `audit_chain` and no DELETE policy.** RLS is enabled (`db/migrations/0001_init.sql:112`) and only a SELECT policy exists. `append_audit_entry` is `SECURITY DEFINER` so it bypasses RLS — fine. But there's nothing in the schema that *enforces* "append-only" beyond convention. A superuser-equivalent could `DELETE FROM audit_chain` and the chain validator (`verify_audit_chain`) would silently report clean for any contiguous remaining sequence. Add either a row-level rule preventing DELETE/UPDATE for all roles, or wire the verifier to assert `MAX(seq) - COUNT(*) = 0` (no gaps). The README claims tamper-evidence; without one of those it's not.

- [ ] **`X-Forwarded-For` is fully trusted with no upstream proxy validation.** `apps/api-gateway/src/middleware/rateLimit.ts:45-55` reads the leftmost XFF value and treats it as ground truth. If the gateway is ever exposed without Caddy in front (or Caddy's XFF trust is misconfigured), an attacker passes `X-Forwarded-For: 1.2.3.4` to bypass rate limits trivially. Add `.env`-driven trust list: only honour XFF if the connecting peer is in `TRUSTED_PROXIES` (default empty in dev → use socket IP).

- [ ] **`ingest` 502 on DB upsert leaves an orphaned MinIO blob with no audit.** `services/ingest/Endpoints/UploadEndpoint.cs:233-251` writes blob then DB-upserts; if the upsert fails, the blob stays in MinIO with no row, the comment claims the reaper will "GC the orphan when the share expires" — but the orphan key has no `share_chunks` row, so `fetchChunkKeys` returns empty and the reaper never deletes it. Net effect: orphan blobs accumulate at every transient DB hiccup. Either delete the blob in the rollback path or add a separate `orphan_chunks` table the reaper polls.

- [ ] **`pnpm-workspace.yaml` doesn't include `services/*`** — only `apps/*` and `packages/*`. The ingest/receipt/reaper services aren't part of the pnpm workspace, which is fine since they're not Node — but it means `pnpm install --frozen-lockfile` from the monorepo root in CI doesn't install the .NET / Go services, and any future tooling (e.g. a `pnpm audit:all` script) silently misses them. Document explicitly or move them into the workspace as virtual entries.

- [ ] **Receipt service's `ConvertToNpgsqlConnectionString` enables `Trust Server Certificate=true` unconditionally.** `services/receipt/Program.cs:212`. For dev that's fine. For prod this disables certificate validation — a MitM between the receipt service and Postgres can intercept connections. Should be `SSL Mode=Require;Trust Server Certificate=false` in production with explicit override only for self-signed dev.

---

## Medium (should fix)

- [ ] **README's "verify my claims" grep commands all miss.** `README.md:240-249` tells the reader to grep for `generateSymmetricKey`, `fragment`, `encryptedBlob`. None of those identifiers exist (it's `generateKey` in `packages/crypto-core/src/symmetric.ts`, the `fragment` mention is only in comments, and `MinioStorage.cs` is actually `MinioBlobStorage.cs` with `PutObjectAsync`). For a portfolio piece whose explicit thesis is "verify the math yourself", broken self-checks read worse than no self-checks.

- [ ] **brew tap / install.sh / scoop install commands in README don't exist.** `README.md:256-264` advertises `brew install philipsloth/tap/slothbox-verify`, `curl -fsSL https://slothbox.com/install.sh | sh`, and `scoop install slothbox-verify`. The tap doesn't exist, no install.sh is shipped, no scoop manifest exists. Cut these or add the placeholder repos.

- [ ] **CHANGELOG / SECURITY claim WAL-G + age-encrypted backups; nothing implements them.** `CHANGELOG.md:74-75` and `SECURITY.md:136`. No WAL-G config in `infra/`, no backup script, no `age` recipient key configured anywhere. Either delete the line or land a minimal cron container.

- [ ] **CHANGELOG / next.config CSP comment claim libsodium-wrappers-sumo; package uses regular libsodium-wrappers.** `apps/web/next.config.mjs:31`, `CHANGELOG.md:46`, `.npmrc:3-4`. The non-sumo build is fine for the primitives in use, but the comments and `.npmrc` hoist pattern suggest the engineer *thought* it was sumo. Pick a build deliberately and align everywhere — the sumo difference matters for `crypto_pwhash` parameters and a few other primitives the v0.5 password-protected-shares feature will need.

- [ ] **`shares.fileHash` is stored but the schema comment says it's "BLAKE2b-256 of plaintext".** `db/migrations/0001_init.sql:21`. The web client never sends a `fileHash` (it sends `keyHash`, which is BLAKE2b-256 of the *key*); the gateway's `CreateShareSchema` (`apps/api-gateway/src/routes/shares.ts:158-164`) calls the same field `fileHash` and validates 32 bytes. Either rename the schema column to `key_hash` (matching what the client actually computes) or compute and send a real plaintext hash from the browser. Storing one and labelling it the other is a minefield for v0.5 reviewers.

- [ ] **`extractKeyFromHash` accepts bare-fragment fallback.** `apps/web/src/lib/download.ts:73-90` falls back to treating the entire `#…` payload as the key if no `key=` param is present — claimed "for backward compatibility" but there's no v0 to be backward-compatible with. This makes every future fragment param a security audit ("does it accidentally look like a 32-byte base64url string?"). Drop the fallback or version it explicitly (`#v=1&key=…`).

- [ ] **Receiver page metadata never overrides `robots`.** `apps/web/src/app/layout.tsx:57-60` sets `robots: { index: true, follow: true }` for everything; `apps/web/src/app/s/[id]/page.tsx` doesn't override. The layout's own comment (`apps/web/src/app/layout.tsx:55-56`) claims "Receiver pages emit their own metadata that flips this off" — but they don't. Add `export const metadata = { robots: { index: false, follow: false } }` to the receiver page.

- [ ] **`apps/web/next.config.mjs` CSP allows `'unsafe-eval'` in production**. Line 39: `script-src 'self'${isDev ? " 'unsafe-eval' 'unsafe-inline'" : " 'unsafe-eval'"}`. `'unsafe-eval'` is enabled in *both* dev and prod. Use `'wasm-unsafe-eval'` only — modern libsodium-wrappers loads WASM via a path that no longer needs full JS eval. The Caddyfile (`infra/caddy/Caddyfile:60`) already gets this right with `'wasm-unsafe-eval'` only — the two layers contradict and whichever is applied last wins.

- [ ] **`apps/api-gateway/src/middleware/rateLimit.ts:60` fails open with a single warn line.** Failing open on Valkey outages is a defensible product call, but the warn-only path means an attacker who can DoS Valkey gets unlimited share-create. At minimum, when the limiter is fully fail-open for >N seconds, also bump a dedicated metric and consider 503'ing share-create explicitly.

- [ ] **CI gates lots of soft-fails.** `.github/workflows/ci.yml:90` (`dotnet test continue-on-error: true`), `:122` (`go test continue-on-error: true`), `.github/workflows/security.yml:151-152` (Trivy `exit-code: "0"` plus `continue-on-error: true`). Combined with no actual tests in the .NET / Go services, the security workflow's value-add is mostly gitleaks + npm audit + CodeQL. The README/SECURITY make stronger CI claims (`SECURITY.md:130-132`: "high/critical findings block merge") than the workflow actually enforces.

- [ ] **No service runs `read_only: true`, no `cap_drop`, no `security_opt: no-new-privileges:true` in docker-compose.** Standard hardening for a stack that brags about EU sovereignty + tamper-evidence. Web/api-gateway/ingest/receipt all run as non-root in their Dockerfiles (good), but the compose-level capability hardening is absent.

- [ ] **`CONTRIBUTING.md` and `docs/ARCHITECTURE.md` referenced everywhere but I didn't enumerate them in this review.** I read what was reachable from `apps/`, `services/`, `packages/`, `db/`, `infra/`, root configs. The doc claims I checked (README threat model vs implementation, CHANGELOG honesty) are based on README + SECURITY + MILESTONES + CHANGELOG. If the v0.5 milestone bullets in MILESTONES are misaligned with the v0.5 ADRs in `docs/adr/`, I didn't catch it.

---

## Low / nits

- [ ] Stray empty directory `apps/web/src/app/s/{[id]}/` (literal braces, an artefact of someone running a glob that didn't expand). Delete it before push — it's loud in `git status` and an obvious "what's that?" for any reviewer.

- [ ] `apps/web/src/lib/utils.ts:63-69` `bytesEqual` early-exits on first mismatch and explicitly comments "NOT constant-time — do NOT use on secrets." It's then called on a hash comparison in `apps/web/src/lib/download.ts:140` — comparing the recipient's hashed key to the gateway-stored hash. The values being compared (BLAKE2b-256 of a public-ish key fingerprint) are not strictly secrets, but the comment-in-one-place / used-on-key-derived-data-in-another is the kind of thing a security reviewer flags every time. Use a constant-time path here for symmetry with the C# `FixedTimeEquals` use in `services/ingest/Endpoints/DeleteEndpoint.cs:106`.

- [ ] `Argon2id` defaults are `OPSLIMIT_MODERATE` (3) + 64 MiB (`packages/crypto-core/src/derivation.ts:21-22`). Defensible for online password auth; on the weak side for one-shot file decryption KDF where slow is fine. Doesn't matter until v0.5 ships password-protected shares — flag for the v0.5 plan.

- [ ] `CONTRIBUTING.md` is referenced from README but I didn't read it; assume it exists.

- [ ] `services/receipt/Program.cs:172-183` accepts both `"info"` and `"information"` for log level — fine, but `services/reaper/internal/reaper/config.go:144` only accepts `"info"`. Inconsistent across services; a deployer who sets `LOG_LEVEL=information` everywhere gets one service silently defaulting. Pick one canonical spelling and document it.

- [ ] `docker-compose.yml:1-9` headers say "Only Caddy is bound to host ports" — the dev compose violates that; the prod compose enforces it. Either rephrase the header to "in production override" or move the dev port bindings into `docker-compose.dev.yml` so the base file is honest.

- [ ] `apps/web/src/lib/upload.ts:127` `clampExpiry` defaults to 168 hours when input is invalid — fine — but the gateway defaults to its own `MAX_SHARE_TTL_DAYS` (30 days). The two expressions of "default expiry" should live in a single shared config so they don't drift.

- [ ] `crypto-core/symmetric.ts:33` `generateKey` uses `randombytes_buf(32)` — fine — but it's not exposed under a name that flags its use as a *symmetric* key (callers might think "key" means asymmetric key in v1.0). Rename to `generateSymmetricKey` (which is also what README:243 already greps for!) so the audit posture matches the documentation.

---

## Things you got right

The crypto wrappers in `packages/crypto-core/` are tight: AEAD (XChaCha20-Poly1305-IETF) used as a drop-in libsodium call, no hand-rolled MAC, explicit length checks on key/nonce/ciphertext, AAD bound to share+chunk, the test matrix covers tamper / wrong-key / wrong-nonce / wrong-AAD failure modes (`packages/crypto-core/tests/symmetric.test.ts`). The decision to run all encryption client-side and put the key in `#key=` is implemented correctly in upload.ts/download.ts modulo the contract bugs above. The Postgres hash-chain helper uses `pg_advisory_xact_lock` for single-writer ordering (correct). The reaper's idempotency on MinIO `NoSuchKey` (`services/reaper/internal/reaper/storage.go:104-112`) is the right call for retry safety. Constant-time token comparison in `DeleteEndpoint.cs:99-106` is well-implemented (hash-then-FixedTimeEquals to defeat length leaks). The `v0.1.0-alpha is a portfolio reference build, not yet pen-tested` warning at the top of README and the "audit status" table in SECURITY are appropriately blunt about the gap. Code comments are above average for a solo project — every non-obvious decision has a paragraph explaining why, which is exactly the discipline a future reviewer (or future-you in six months) needs.
